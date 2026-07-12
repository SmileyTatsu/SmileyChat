import { useMemo } from "preact/hooks";

import { loadLorebook } from "#frontend/lib/api/client";
import {
    type ConnectionSettings,
    getActiveConnectionProfile,
} from "#frontend/lib/connections/config";
import {
    filterLocalChatGenerationMessageAttachments,
    materializeChatGenerationMessageAttachments,
} from "#frontend/lib/connections/images";
import { parseToolArguments } from "#frontend/lib/connections/chat-completions";
import { getAdapterForSettings } from "#frontend/lib/connections/registry";
import { createServerGenerationConnection } from "#frontend/lib/connections/server-adapter";
import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ToolActivity,
    ToolCall,
    ToolResult,
} from "#frontend/lib/connections/types";
import { ChatGenerationMessageRole } from "#frontend/lib/connections/types";
import { messageFromError } from "#frontend/lib/common/errors";
import { isActiveSwipeError } from "#frontend/lib/messages";
import { isGroupChat } from "#frontend/lib/chats/normalize";
import { createLorebookPromptInjections } from "#frontend/lib/lorebooks/engine";
import type { Lorebook, LorebookCollection } from "#frontend/lib/lorebooks/types";
import {
    getInputMiddlewares,
    getOutputMiddlewares,
    getPluginSnapshot,
    getPluginTool,
    getPluginTools,
    getPromptContextMiddlewares,
    getPromptInjectors,
    getPromptMiddlewares,
} from "#frontend/lib/plugins/registry";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import { compilePresetMessages } from "#frontend/lib/presets/compile";
import {
    defaultContextTokenBudget,
    normalizeContextTokenBudget,
} from "#frontend/lib/presets/context-budget-constants";
import { resolvePresetMacros } from "#frontend/lib/presets/macros";
import type { PresetCollection } from "#frontend/lib/presets/types";
import {
    assertPromptMessagesWithinBudget,
    buildPromptForGeneration,
} from "#frontend/lib/prompt/build";
import type { PromptGenerationTrigger, PromptInjector } from "#frontend/lib/prompt/types";
import type {
    ChatMode,
    ChatSession,
    Message,
    MessageToolActivity,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

type MutableRef<T> = {
    current: T;
};

type UsePromptGenerationOptions = {
    character: SmileyCharacter;
    connectionSettings: ConnectionSettings;
    groupCharacters: SmileyCharacter[];
    latestChatRef: MutableRef<ChatSession | undefined>;
    lorebookCollection: LorebookCollection;
    mode: ChatMode;
    persona: SmileyPersona;
    preferences: AppPreferences;
    presetCollection: PresetCollection;
    userStatus: UserStatus;
};

export type DebugGenerationPayload = {
    request: ChatGenerationRequest;
    payload: unknown;
};

export function usePromptGeneration({
    character,
    connectionSettings,
    groupCharacters,
    latestChatRef,
    lorebookCollection,
    mode,
    persona,
    preferences,
    presetCollection,
    userStatus,
}: UsePromptGenerationOptions) {
    const activePreset = useMemo(
        () =>
            presetCollection.presets.find(
                (preset) => preset.id === presetCollection.activePresetId,
            ),
        [presetCollection],
    );
    const contextTokenBudget = normalizeContextTokenBudget(
        getActiveConnectionProfile(connectionSettings)?.contextTokenBudget,
        defaultContextTokenBudget,
    );

    function groupPromptContext(sourceChat: ChatSession | undefined) {
        if (!sourceChat || !isGroupChat(sourceChat)) {
            return undefined;
        }

        return {
            joinPrefix: sourceChat.group?.joinPrefix,
            memberIds: (sourceChat.members ?? []).map((member) => member.characterId),
        };
    }

    function resolveChatMacros(
        content: string,
        sourceMessages: Message[],
        sourceCharacter = character,
    ) {
        return resolvePresetMacros(content, {
            character: sourceCharacter,
            group: groupPromptContext(latestChatRef.current),
            messages: sourceMessages,
            mode,
            personaDescription: persona.description,
            personaName: persona.name,
            userStatus,
        });
    }

    function createAuthorNotePromptInjector(): PromptInjector {
        return (context) => {
            const authorNote = context.chat.metadata?.authorNote;
            const content = authorNote?.content?.trim();

            if (!authorNote || authorNote.isEnabled === false || !content) {
                return [];
            }

            const role =
                authorNote.role === "user" || authorNote.role === "assistant"
                    ? authorNote.role
                    : "system";
            const depth =
                typeof authorNote.depth === "number" && Number.isFinite(authorNote.depth)
                    ? Math.max(0, Math.floor(authorNote.depth))
                    : 0;

            return [
                {
                    id: "core.author-note",
                    source: "core",
                    role,
                    content: resolvePresetMacros(content, {
                        character: context.character,
                        group: context.group,
                        messages: context.messages,
                        mode: context.mode,
                        personaDescription: context.persona.description,
                        personaName: context.persona.name,
                        userStatus: context.userStatus,
                    }),
                    anchor: "at-depth",
                    depth,
                    order: 1000,
                },
            ];
        };
    }

    async function generateWithPreset(
        sourceMessages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
        sourceConnectionSettings: ConnectionSettings,
        options: {
            onImage?: (url: string) => void;
            promptCharacter?: SmileyCharacter;
            onReasoningToken?: (token: string) => void;
            onToken?: (token: string) => void;
            onToolActivities?: (activities: MessageToolActivity[]) => void;
            signal?: AbortSignal;
            sourceChat?: ChatSession;
            stream?: boolean;
            targetMessageId?: string;
            trigger?: PromptGenerationTrigger;
        } = {},
    ) {
        const connection = createServerGenerationConnection(
            getActiveConnectionProfile(sourceConnectionSettings)?.id,
        );
        const request = await buildGenerationRequest(
            sourceMessages,
            sourceCharacter,
            sourceMode,
            sourceUserStatus,
            options,
        );
        const registeredTools = getPluginTools();
        const tools = registeredTools.map(({ name, description, parameters }) => ({
            name,
            description,
            parameters,
        }));

        if (tools.length) {
            request.tools = tools;
        }

        const generationMessages = request.messages;
        const { result, activities, promptMessages } = await runToolLoop(
            connection,
            request,
            options.onToolActivities,
        );

        const message = await applyOutputMiddlewares(
            result.message,
            generationMessages,
            promptMessages,
            sourceCharacter,
            sourceMode,
            sourceUserStatus,
            result,
            options,
        );

        return { ...result, message, toolActivities: activities };
    }

    async function runToolLoop(
        connection: ReturnType<typeof getAdapterForSettings>,
        request: ChatGenerationRequest,
        onToolActivities?: (activities: MessageToolActivity[]) => void,
    ) {
        let promptMessages = request.promptMessages ?? [];
        let result = await connection.generate({
            ...request,
            promptMessages,
        });
        const activities: ToolActivity[] = [];
        const maxIterations = 8;

        for (let iteration = 0; result.toolCalls?.length; iteration += 1) {
            if (iteration >= maxIterations) {
                throw new Error(
                    `Tool calling stopped after ${maxIterations} model iterations.`,
                );
            }

            const toolResults: ToolResult[] = [];

            for (const call of result.toolCalls) {
                const toolDef = getPluginTool(call.name);
                if (toolDef?.displayName) {
                    call.displayName = toolDef.displayName;
                }

                const pendingActivity: MessageToolActivity = {
                    call,
                    result: {
                        toolCallId: call.id,
                        name: call.name,
                        content: "Running…",
                    },
                    status: "running",
                };
                onToolActivities?.([...activities, pendingActivity]);

                const toolResult = await runPluginTool(call, request.signal);
                toolResults.push(toolResult);
                activities.push({ call, result: toolResult });
                onToolActivities?.([...activities]);
            }

            promptMessages = [
                ...promptMessages,
                {
                    role: ChatGenerationMessageRole.Assistant,
                    content: result.message,
                    reasoning: result.reasoning,
                    reasoningDetails: result.reasoningDetails,
                    toolCalls: result.toolCalls,
                },
                ...toolResults.map(
                    (toolResult): ChatGenerationMessage => ({
                        role: ChatGenerationMessageRole.User,
                        content: toolResult.content,
                        toolResult,
                    }),
                ),
            ];

            result = await connection.generate({
                ...request,
                promptMessages,
            });
        }

        return { result, activities, promptMessages };
    }

    async function runPluginTool(
        call: ToolCall,
        signal?: AbortSignal,
    ): Promise<ToolResult> {
        const tool = getPluginTool(call.name);

        console.info(
            "[SmileyChat tool call]",
            call.name,
            call.arguments ?? call.argumentsText,
        );

        if (!tool) {
            const content = `Tool error: Tool "${call.name}" is not registered or enabled.`;
            console.error("[SmileyChat tool error]", call.name, content);
            return {
                toolCallId: call.id,
                name: call.name,
                content,
                isError: true,
            };
        }

        const args = call.arguments ?? parseToolArguments(call.argumentsText);

        if (!args) {
            const content = `Tool error: Tool "${call.name}" arguments were not a JSON object.`;
            console.error("[SmileyChat tool error]", call.name, content);
            return {
                toolCallId: call.id,
                name: call.name,
                content,
                isError: true,
            };
        }

        const snapshot = getPluginSnapshot();

        if (!snapshot) {
            const content = `Tool error: App state snapshot is not available for "${call.name}".`;
            console.error("[SmileyChat tool error]", call.name, content);
            return {
                toolCallId: call.id,
                name: call.name,
                content,
                isError: true,
            };
        }

        try {
            const content = await raceWithAbort(
                () => tool.run(args, { ...snapshot, signal }),
                signal,
            );

            return {
                toolCallId: call.id,
                name: call.name,
                content: typeof content === "string" ? content : String(content),
            };
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }

            const content = `Tool error: ${messageFromError(error)}`;
            console.error("[SmileyChat tool error]", call.name, error);
            return {
                toolCallId: call.id,
                name: call.name,
                content,
                isError: true,
            };
        }
    }

    function raceWithAbort<T>(
        run: () => T | Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        if (!signal) return Promise.resolve().then(run);
        if (signal.aborted) return Promise.reject(createAbortError());

        return new Promise<T>((resolve, reject) => {
            const onAbort = () => reject(createAbortError());
            signal.addEventListener("abort", onAbort, { once: true });

            Promise.resolve()
                .then(() => {
                    if (signal.aborted) throw createAbortError();
                    return run();
                })
                .then(resolve, reject)
                .finally(() => {
                    signal.removeEventListener("abort", onAbort);
                });
        });
    }

    function createAbortError() {
        return new DOMException("The operation was aborted.", "AbortError");
    }

    function isAbortError(error: unknown) {
        return (
            (error instanceof DOMException && error.name === "AbortError") ||
            (error instanceof Error && error.name === "AbortError")
        );
    }

    async function getDebugPayload(
        sourceMessages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
        sourceConnectionSettings: ConnectionSettings,
        options: {
            promptCharacter?: SmileyCharacter;
            sourceChat?: ChatSession;
            stream?: boolean;
            targetMessageId?: string;
            trigger?: PromptGenerationTrigger;
        } = {},
    ): Promise<DebugGenerationPayload> {
        const connection = getAdapterForSettings(sourceConnectionSettings);
        const request = await buildGenerationRequest(
            sourceMessages,
            sourceCharacter,
            sourceMode,
            sourceUserStatus,
            options,
        );
        const tools = getPluginTools().map(({ name, description, parameters }) => ({
            name,
            description,
            parameters,
        }));

        if (tools.length) {
            request.tools = tools;
        }

        const payload = await connection.buildPayload(request);

        return { request, payload };
    }

    async function buildGenerationRequest(
        sourceMessages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
        options: {
            onImage?: (url: string) => void;
            promptCharacter?: SmileyCharacter;
            onReasoningToken?: (token: string) => void;
            onToken?: (token: string) => void;
            signal?: AbortSignal;
            sourceChat?: ChatSession;
            stream?: boolean;
            targetMessageId?: string;
            trigger?: PromptGenerationTrigger;
        } = {},
    ): Promise<ChatGenerationRequest> {
        const sourceGenerationMessages = sourceMessages.filter(
            (message) => !isActiveSwipeError(message),
        );
        const promptCharacter = options.promptCharacter ?? sourceCharacter;
        const promptChat = options.sourceChat ?? latestChatRef.current;

        if (!promptChat) {
            throw new Error("No active chat is available for prompt generation.");
        }

        const nativeLorebooks = await loadNativeLorebooks(promptChat, promptCharacter);
        const promptBuild = await buildPromptForGeneration({
            context: {
                chat: promptChat,
                character: promptCharacter,
                group: groupPromptContext(latestChatRef.current),
                groupCharacters,
                generation: {
                    activeCharacterId: sourceCharacter.id,
                    stream: options.stream === true,
                    ...(options.targetMessageId
                        ? { targetMessageId: options.targetMessageId }
                        : {}),
                    trigger: options.trigger ?? "send",
                },
                lorebooks: nativeLorebooks,
                messages: sourceGenerationMessages,
                mode: sourceMode,
                persona,
                preferences,
                preset: activePreset,
                tokenBudget: contextTokenBudget,
                userStatus: sourceUserStatus,
            },
            contextMiddlewares: getPromptContextMiddlewares(),
            injectors: [
                createAuthorNotePromptInjector(),
                (context) =>
                    createLorebookPromptInjections(nativeLorebooks, {
                        generation: context.generation,
                        messages: context.messages,
                        resolveContent: (content) =>
                            resolvePresetMacros(content, {
                                character: context.character,
                                group: context.group,
                                messages: context.messages,
                                mode: context.mode,
                                personaDescription: context.persona.description,
                                personaName: context.persona.name,
                                userStatus: context.userStatus,
                            }),
                    }),
                ...getPromptInjectors(),
            ],
        });
        const generationMessages = promptBuild.messages;
        const promptMessages = await applyPromptMiddlewares(
            promptBuild.promptMessages,
            generationMessages,
            promptCharacter,
            sourceMode,
            sourceUserStatus,
        );
        const localPromptMessages = filterLocalChatGenerationMessageAttachments(
            promptMessages,
            promptChat.id,
        );
        assertPromptMessagesWithinBudget(localPromptMessages, contextTokenBudget);
        const materializedPromptMessages =
            await materializeChatGenerationMessageAttachments(localPromptMessages);

        return {
            generation: activePreset?.generation,
            messages: generationMessages,
            debug: promptBuild.debug,
            onImage: options.onImage,
            onReasoningToken: options.onReasoningToken,
            onToken: options.onToken,
            promptMessages: materializedPromptMessages,
            signal: options.signal,
            stream: options.stream,
        };
    }

    async function loadNativeLorebooks(
        sourceChat: ChatSession,
        sourceCharacter: SmileyCharacter,
    ): Promise<Lorebook[]> {
        try {
            const lorebookIds = Array.from(
                new Set(
                    [
                        ...(sourceChat.metadata?.lorebookIds ?? []),
                        sourceCharacter.metadata?.primaryLorebookId,
                        ...(sourceCharacter.metadata?.lorebookIds ?? []),
                        ...(persona.metadata?.lorebookIds ?? []),
                    ].filter((id): id is string => Boolean(id)),
                ),
            );

            const lorebooks = await Promise.all(
                lorebookIds.map(async (lorebookId) => {
                    try {
                        return await loadLorebook(lorebookId);
                    } catch {
                        return undefined;
                    }
                }),
            );

            return lorebooks.filter((item): item is Lorebook => Boolean(item));
        } catch (error) {
            console.warn("Failed to load native LoreBooks:", error);
            return [];
        }
    }

    async function applyInputMiddlewares(
        content: string,
        messages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
    ) {
        let nextContent = content;

        for (const middleware of getInputMiddlewares()) {
            nextContent = await middleware(nextContent, {
                character: sourceCharacter,
                messages,
                mode: sourceMode,
                persona,
                presetCollection,
                userStatus: sourceUserStatus,
            });
        }

        return nextContent.trim();
    }

    async function applyPromptMiddlewares(
        promptMessages: ReturnType<typeof compilePresetMessages>,
        messages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
    ) {
        let nextMessages = promptMessages;

        for (const middleware of getPromptMiddlewares()) {
            nextMessages = await middleware(nextMessages, {
                character: sourceCharacter,
                messages,
                mode: sourceMode,
                persona,
                promptMessages: nextMessages,
                presetCollection,
                userStatus: sourceUserStatus,
            });
        }

        return nextMessages;
    }

    async function applyOutputMiddlewares(
        content: string,
        messages: Message[],
        originalPromptMessages: ChatGenerationMessage[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
        result: Awaited<ReturnType<ReturnType<typeof getAdapterForSettings>["generate"]>>,
        options: {
            sourceChat?: ChatSession;
            targetMessageId?: string;
            trigger?: PromptGenerationTrigger;
        } = {},
    ) {
        let nextContent = content;
        const sourceChat = options.sourceChat ?? latestChatRef.current;

        for (const middleware of getOutputMiddlewares()) {
            nextContent = await middleware(nextContent, {
                chatId: sourceChat?.id,
                character: sourceCharacter,
                messages,
                mode: sourceMode,
                originalPromptMessages,
                persona,
                presetCollection,
                result,
                sourceChat,
                targetMessageId: options.targetMessageId,
                trigger: options.trigger ?? "send",
                userStatus: sourceUserStatus,
            });
        }

        return nextContent;
    }

    return {
        applyInputMiddlewares,
        buildGenerationRequest,
        generateWithPreset,
        getDebugPayload,
        resolveChatMacros,
    };
}
