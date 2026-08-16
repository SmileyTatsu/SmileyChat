import type { Message } from "#frontend/types";

import type { ChatGenerationMessage } from "../connections/types";
import { compilePresetMessagesWithMetadata } from "../presets/compile";
import type { SmileyPreset } from "../presets/types";
import {
    protectedHistoryMessageId,
    selectHistoryMessagesForBudget,
} from "./history-budget";
import {
    applyPromptInjectionsWithMetadata,
    type AnchoredPromptMessage,
} from "./injections";
import { createPromptOutletRegistry } from "./outlets";
import {
    estimateChatGenerationMessages,
    estimateGenerationMessage,
    estimatePromptInjection,
} from "./token-estimator";
import type {
    PromptBuildContext,
    PromptBuildDebug,
    PromptDebugBlock,
    PromptBuildResult,
    PromptBudgetPlan,
    PromptContextMiddleware,
    PromptInjection,
    PromptInjector,
} from "./types";
import { providerTokenPolicy } from "../connections/token-policy";
import { formatCustomInstructPrompt, formatInstructPrompt } from "../instruct";
import { estimateText } from "./token-estimator";

export async function buildPromptForGeneration({
    context,
    contextMiddlewares = [],
    injectors = [],
}: {
    context: PromptBuildContext;
    contextMiddlewares?: PromptContextMiddleware[];
    injectors?: PromptInjector[];
}): Promise<PromptBuildResult> {
    const processedContext = await applyContextMiddlewares(context, contextMiddlewares);
    const injections = await collectPromptInjections(processedContext, injectors);
    const textCompletionWorldInfo = processedContext.isTextCompletion
        ? textCompletionWorldInfoFromInjections(injections)
        : undefined;
    const textCompletionAnchors = processedContext.isTextCompletion
        ? textCompletionAnchorsFromInjections(injections)
        : undefined;
    const promptContext = {
        ...processedContext,
        ...(textCompletionWorldInfo ? { textCompletionWorldInfo } : {}),
        ...(textCompletionAnchors ? { textCompletionAnchors } : {}),
    };
    const promptInjections =
        textCompletionWorldInfo || textCompletionAnchors
            ? injections.filter(
                  (injection) =>
                      !(
                          (injection.anchor === "before-character" ||
                              injection.anchor === "after-character") &&
                          (injection.source === "lorebook" ||
                              Boolean(
                                  textCompletionAnchors?.[
                                      injection.anchor === "before-character"
                                          ? "before"
                                          : "after"
                                  ],
                              ))
                      ),
              )
            : injections;
    const budget = planPromptBudget(promptContext, promptInjections);
    const historyMessages = selectHistoryMessagesForBudget({
        messages: promptContext.messages,
        availableHistoryTokens: budget.availableHistoryTokens,
        tokenContext: promptContext.tokenContext,
    });
    const outlets = createPromptOutletRegistry(promptInjections);
    const compiled = compilePresetMessagesWithMetadata(promptContext.preset, {
        character: promptContext.character,
        generation: promptContext.generation,
        group: promptContext.group,
        // Pre-selection is a fast conservative estimate; final budget is enforced after compile.
        historyMessages,
        metadata: promptContext.metadata ?? promptContext.chat.metadata,
        messages: promptContext.messages,
        mode: promptContext.mode,
        outlets,
        personaDescription: promptContext.persona.description,
        personaName: promptContext.persona.name,
        userStatus: promptContext.userStatus,
        formatting: promptContext.preferences.formatting.settings,
        isTextCompletion: promptContext.isTextCompletion,
        worldInfoBefore: promptContext.textCompletionWorldInfo?.before,
        worldInfoAfter: promptContext.textCompletionWorldInfo?.after,
        anchorBefore: promptContext.textCompletionAnchors?.before,
        anchorAfter: promptContext.textCompletionAnchors?.after,
    });
    const promptItems = applyPromptInjectionsWithMetadata(compiled, promptInjections);
    const trimmedPrompt = finalizeAssembledPromptBudget({
        formatting: promptContext.preferences.formatting.settings,
        isTextCompletion: promptContext.isTextCompletion === true,
        messages: historyMessages,
        promptItems,
        tokenBudget: promptContext.tokenBudget,
        tokenContext: promptContext.tokenContext,
    });

    return {
        debug: buildDebug({
            budget,
            injections: promptInjections,
            messages: trimmedPrompt.messages,
            promptItems: trimmedPrompt.promptItems,
            preset: promptContext.preset,
            sourceMessages: promptContext.messages,
            tokenEstimate: trimmedPrompt.tokenEstimate,
        }),
        messages: trimmedPrompt.messages,
        promptMessages: trimmedPrompt.promptMessages,
    };
}

function textCompletionWorldInfoFromInjections(injections: PromptInjection[]) {
    const contentFor = (anchor: "before-character" | "after-character") =>
        injections
            .filter(
                (injection) =>
                    injection.source === "lorebook" && injection.anchor === anchor,
            )
            .sort((a, b) => a.order - b.order)
            .map((injection) => injection.content)
            .join("\n\n");
    return {
        before: contentFor("before-character"),
        after: contentFor("after-character"),
    };
}

function textCompletionAnchorsFromInjections(injections: PromptInjection[]) {
    const contentFor = (anchor: "before-character" | "after-character") =>
        injections
            .filter(
                (injection) =>
                    injection.source !== "lorebook" && injection.anchor === anchor,
            )
            .sort((a, b) => a.order - b.order)
            .map((injection) => injection.content)
            .join("\n\n");
    return {
        before: contentFor("before-character"),
        after: contentFor("after-character"),
    };
}

function planPromptBudget(
    context: PromptBuildContext,
    injections: PromptInjection[],
): PromptBudgetPlan {
    const outlets = createPromptOutletRegistry(injections);
    const staticPromptMessages = compilePresetMessagesWithMetadata(context.preset, {
        character: context.character,
        generation: context.generation,
        group: context.group,
        metadata: context.metadata ?? context.chat.metadata,
        messages: [],
        mode: context.mode,
        outlets,
        personaDescription: context.persona.description,
        personaName: context.persona.name,
        userStatus: context.userStatus,
        formatting: context.preferences.formatting.settings,
        isTextCompletion: context.isTextCompletion,
        worldInfoBefore: context.textCompletionWorldInfo?.before,
        worldInfoAfter: context.textCompletionWorldInfo?.after,
        anchorBefore: context.textCompletionAnchors?.before,
        anchorAfter: context.textCompletionAnchors?.after,
    }).map((item) => item.message);
    const staticPromptTokens = estimateChatGenerationMessages(
        staticPromptMessages,
        context.tokenContext,
    );
    const injectionTokens = injections.reduce(
        (total, injection) =>
            estimatePromptInjection(injection, context.tokenContext) + total,
        0,
    );
    const reservedTokens =
        staticPromptTokens +
        injectionTokens +
        providerTokenPolicy(context.tokenContext).safetyMargin;

    return {
        availableHistoryTokens: Math.max(0, context.tokenBudget - reservedTokens),
        injectionTokens,
        reservedTokens,
        staticPromptTokens,
        tokenBudget: context.tokenBudget,
    };
}

async function applyContextMiddlewares(
    context: PromptBuildContext,
    middlewares: PromptContextMiddleware[],
) {
    let nextContext = context;

    for (const middleware of middlewares) {
        nextContext = await middleware(nextContext);
    }

    return nextContext;
}

async function collectPromptInjections(
    context: PromptBuildContext,
    injectors: PromptInjector[],
) {
    const injections: PromptInjection[] = [];

    for (const injector of injectors) {
        injections.push(...normalizePromptInjections(await injector(context)));
    }

    return injections;
}

function normalizePromptInjections(value: PromptInjection[]) {
    return value.filter(
        (injection) =>
            injection &&
            typeof injection.id === "string" &&
            typeof injection.content === "string" &&
            injection.content.trim().length > 0,
    );
}

function finalizeAssembledPromptBudget({
    formatting,
    isTextCompletion,
    messages,
    promptItems,
    tokenBudget,
    tokenContext,
}: {
    formatting: import("../presets/types").PresetFormattingSettings;
    isTextCompletion: boolean;
    messages: Message[];
    promptItems: AnchoredPromptMessage[];
    tokenBudget: number;
    tokenContext?: import("../tokenizer").TokenCountContext;
}) {
    const output = [...promptItems];
    const itemCosts = output.map((item) =>
        estimateGenerationMessage(item.message, tokenContext),
    );
    const protectedHistoryId = protectedHistoryMessageId(messages);
    const estimate = () =>
        isTextCompletion
            ? estimateText(
                  serializeTextCompletionPrompt(
                      output.map((item) => item.message),
                      formatting,
                  ),
                  tokenContext,
              )
            : itemCosts.reduce((total, cost) => total + cost, 0);
    let tokenEstimate = estimate();

    while (tokenEstimate > tokenBudget) {
        const index = firstRemovableHistoryIndex(output, protectedHistoryId);

        if (index < 0) {
            break;
        }

        const removedCost = removeHistoryPromptAt(output, itemCosts, index);
        tokenEstimate = isTextCompletion ? estimate() : tokenEstimate - removedCost;
    }

    while (tokenEstimate > tokenBudget) {
        const index = firstRemovableInjectionIndex(output);

        if (index < 0) {
            break;
        }

        const removedCost = itemCosts[index] ?? 0;
        output.splice(index, 1);
        itemCosts.splice(index, 1);
        tokenEstimate = isTextCompletion ? estimate() : tokenEstimate - removedCost;
    }

    const promptMessages = output.map((item) => item.message);

    assertPromptMessagesWithinBudget(promptMessages, tokenBudget, tokenContext);

    const selectedMessageIds = new Set(
        output
            .filter((item) => item.source === "history" && item.messageId)
            .map((item) => item.messageId),
    );

    return {
        messages: messages.filter((message) => selectedMessageIds.has(message.id)),
        promptItems: output,
        promptMessages,
        tokenEstimate,
    };
}

function serializeTextCompletionPrompt(
    messages: ChatGenerationMessage[],
    formatting: import("../presets/types").PresetFormattingSettings,
) {
    if (formatting.instructTemplate === "custom") {
        return formatCustomInstructPrompt(messages, formatting);
    }
    if (formatting.instructTemplate === "none") {
        return messages
            .map((message) =>
                typeof message.content === "string"
                    ? message.content
                    : message.content
                          .map((part) => (part.type === "text" ? part.text : ""))
                          .join("\n"),
            )
            .join("\n");
    }
    return formatInstructPrompt(
        messages,
        formatting.instructTemplate ?? "auto",
        "",
        formatting,
    );
}

function firstRemovableHistoryIndex(
    messages: AnchoredPromptMessage[],
    protectedHistoryId: string | undefined,
) {
    return messages.findIndex(
        (message) =>
            message.source === "history" &&
            (!protectedHistoryId || message.messageId !== protectedHistoryId),
    );
}

function firstRemovableInjectionIndex(messages: AnchoredPromptMessage[]) {
    return (
        messages
            .map((message, index) => ({ index, message }))
            .filter(
                ({ message }) =>
                    message.source === "injection" &&
                    message.tokenBudgetBehavior !== "ignore-budget",
            )
            .sort((a, b) => {
                const priority =
                    (a.message.injectionPriority ?? 0) -
                    (b.message.injectionPriority ?? 0);

                if (priority !== 0) {
                    return priority;
                }

                return (a.message.injectionOrder ?? 0) - (b.message.injectionOrder ?? 0);
            })[0]?.index ?? -1
    );
}

function removeHistoryPromptAt(
    messages: AnchoredPromptMessage[],
    itemCosts: number[],
    index: number,
) {
    const item = messages[index];

    if (!item?.message.toolCalls?.length && !item?.message.toolResult) {
        const cost = itemCosts[index] ?? 0;
        messages.splice(index, 1);
        itemCosts.splice(index, 1);
        return cost;
    }

    let start = index;
    let deleteCount = 1;

    while (
        start > 0 &&
        isAdjacentToolProtocolPair(messages[start - 1], messages[start])
    ) {
        start -= 1;
        deleteCount += 1;
    }

    while (
        start + deleteCount < messages.length &&
        isAdjacentToolProtocolPair(
            messages[start + deleteCount - 1],
            messages[start + deleteCount],
        )
    ) {
        deleteCount += 1;
    }

    let removedCost = 0;

    for (let offset = 0; offset < deleteCount; offset += 1) {
        removedCost += itemCosts[start + offset] ?? 0;
    }

    messages.splice(start, deleteCount);
    itemCosts.splice(start, deleteCount);
    return removedCost;
}

function isAdjacentToolProtocolPair(
    left: AnchoredPromptMessage | undefined,
    right: AnchoredPromptMessage | undefined,
) {
    if (!left || !right) {
        return false;
    }

    const leftCallIds = new Set(
        (left.message.toolCalls ?? []).map((toolCall) => toolCall.id),
    );
    const rightCallIds = new Set(
        (right.message.toolCalls ?? []).map((toolCall) => toolCall.id),
    );

    return Boolean(
        (right.message.toolResult &&
            leftCallIds.has(right.message.toolResult.toolCallId)) ||
        (left.message.toolResult && rightCallIds.has(left.message.toolResult.toolCallId)),
    );
}

export function assertPromptMessagesWithinBudget(
    promptMessages: ChatGenerationMessage[],
    tokenBudget: number,
    tokenContext?: import("../tokenizer").TokenCountContext,
) {
    const tokenEstimate = estimateChatGenerationMessages(promptMessages, tokenContext);

    if (tokenEstimate <= tokenBudget) {
        return;
    }

    throw new Error(
        `Estimated prompt size (${tokenEstimate.toLocaleString()} tokens) exceeds the active context token limit (${tokenBudget.toLocaleString()} tokens). Shorten the latest message, remove large images or prompt content, or increase the active connection context limit.`,
    );
}

export function reconcilePromptDebugBlocks(
    debug: PromptBuildDebug,
    promptMessages: ChatGenerationMessage[],
): PromptBuildDebug {
    const availableBlocks = new Map<string, PromptDebugBlock[]>();

    for (const block of debug.blocks) {
        const matches = availableBlocks.get(block.messageFingerprint) ?? [];
        matches.push(block);
        availableBlocks.set(block.messageFingerprint, matches);
    }

    return {
        ...debug,
        blocks: promptMessages.map((message) => {
            const fingerprint = promptMessageFingerprint(message);
            const block = availableBlocks.get(fingerprint)?.shift();

            return (
                block ?? {
                    kind: "source",
                    label: "Modified or added by prompt middleware",
                    messageFingerprint: fingerprint,
                    source: "middleware",
                }
            );
        }),
    };
}

function buildDebug({
    budget,
    injections,
    messages,
    promptItems,
    preset,
    sourceMessages,
    tokenEstimate,
}: {
    budget: PromptBudgetPlan;
    injections: PromptInjection[];
    messages: Message[];
    promptItems: AnchoredPromptMessage[];
    preset: SmileyPreset | undefined;
    sourceMessages: Message[];
    tokenEstimate: number;
}): PromptBuildDebug {
    const selectedMessageIds = new Set(messages.map((message) => message.id));

    return {
        blocks: promptItems.map((item) => promptDebugBlock(item, preset)),
        budget,
        injections,
        selectedMessageIds: messages.map((message) => message.id),
        tokenEstimate,
        trimmedMessageIds: sourceMessages
            .filter((message) => !selectedMessageIds.has(message.id))
            .map((message) => message.id),
        warnings:
            tokenEstimate > budget.tokenBudget
                ? ["Estimated prompt size exceeds the active context token budget."]
                : [],
    };
}

function promptDebugBlock(
    item: AnchoredPromptMessage,
    preset: SmileyPreset | undefined,
): PromptDebugBlock {
    const messageFingerprint = promptMessageFingerprint(item.message);
    const prompt = item.promptId
        ? preset?.prompts.find((candidate) => candidate.id === item.promptId)
        : undefined;

    if (prompt) {
        return {
            kind: "prompt",
            label: prompt.title,
            messageFingerprint,
            source: item.source,
        };
    }

    if (item.promptId === "model-system-prompt") {
        return {
            kind: "prompt",
            label: "Model System Prompt (Formatting)",
            messageFingerprint,
            source: item.source,
        };
    }

    if (item.promptId === "character-description") {
        return {
            kind: "prompt",
            label: "Character Description",
            messageFingerprint,
            source: item.source,
        };
    }

    if (item.promptId === "character-personality") {
        return {
            kind: "prompt",
            label: "Character Personality",
            messageFingerprint,
            source: item.source,
        };
    }

    if (item.promptId === "persona-description") {
        return {
            kind: "prompt",
            label: "Persona Description",
            messageFingerprint,
            source: item.source,
        };
    }

    if (item.promptId === "scenario") {
        return {
            kind: "prompt",
            label: "Scenario & Instructions",
            messageFingerprint,
            source: item.source,
        };
    }

    if (item.promptId === "dialogue-examples") {
        return {
            kind: "prompt",
            label: "Chat Examples",
            messageFingerprint,
            source: item.source,
        };
    }

    if (item.source === "history") {
        return {
            kind: "source",
            label: "Chat History",
            messageFingerprint,
            source: "history",
        };
    }

    if (item.source === "injection") {
        return {
            kind: "source",
            label: injectionDebugLabel(item.injectionId, item.injectionSource),
            messageFingerprint,
            source: "injection",
        };
    }

    return {
        kind: "source",
        label: "Preset fallback",
        messageFingerprint,
        source: "preset",
    };
}

function injectionDebugLabel(
    injectionId: string | undefined,
    source: PromptInjection["source"] | undefined,
) {
    if (injectionId === "core.author-note") return "Author Note";
    if (source === "lorebook") return "LoreBook";
    if (source === "plugin") return "Plugin injection";
    if (source === "preset") return "Preset injection";
    return "Core prompt injection";
}

function promptMessageFingerprint(message: ChatGenerationMessage) {
    return JSON.stringify([
        message.role,
        message.content,
        message.reasoning,
        message.reasoningDetails,
        message.toolCalls,
        message.toolResult,
    ]);
}

export function activePresetFromCollection(
    presets: SmileyPreset[],
    activePresetId: string,
) {
    return presets.find((preset) => preset.id === activePresetId);
}
