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

const contextEstimatePaddingTokens = 1024;

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
    const budget = planPromptBudget(processedContext, injections);
    const historyMessages = selectHistoryMessagesForBudget({
        messages: processedContext.messages,
        availableHistoryTokens: budget.availableHistoryTokens,
    });
    const outlets = createPromptOutletRegistry(injections);
    const compiled = compilePresetMessagesWithMetadata(processedContext.preset, {
        character: processedContext.character,
        generation: processedContext.generation,
        group: processedContext.group,
        // Pre-selection is a fast conservative estimate; final budget is enforced after compile.
        historyMessages,
        metadata: processedContext.metadata ?? processedContext.chat.metadata,
        messages: processedContext.messages,
        mode: processedContext.mode,
        outlets,
        personaDescription: processedContext.persona.description,
        personaName: processedContext.persona.name,
        userStatus: processedContext.userStatus,
    });
    const promptItems = applyPromptInjectionsWithMetadata(compiled, injections);
    const trimmedPrompt = finalizeAssembledPromptBudget({
        messages: historyMessages,
        promptItems,
        tokenBudget: processedContext.tokenBudget,
    });

    return {
        debug: buildDebug({
            budget,
            injections,
            messages: trimmedPrompt.messages,
            promptItems: trimmedPrompt.promptItems,
            preset: processedContext.preset,
            sourceMessages: processedContext.messages,
            tokenEstimate: trimmedPrompt.tokenEstimate,
        }),
        messages: trimmedPrompt.messages,
        promptMessages: trimmedPrompt.promptMessages,
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
    }).map((item) => item.message);
    const staticPromptTokens = estimateChatGenerationMessages(staticPromptMessages);
    const injectionTokens = injections.reduce(
        (total, injection) => total + estimatePromptInjection(injection),
        0,
    );
    const reservedTokens =
        staticPromptTokens + injectionTokens + contextEstimatePaddingTokens;

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
    messages,
    promptItems,
    tokenBudget,
}: {
    messages: Message[];
    promptItems: AnchoredPromptMessage[];
    tokenBudget: number;
}) {
    const output = [...promptItems];
    const itemCosts = output.map((item) => estimateGenerationMessage(item.message));
    const protectedHistoryId = protectedHistoryMessageId(messages);
    let tokenEstimate = itemCosts.reduce((total, cost) => total + cost, 0);

    while (tokenEstimate > tokenBudget) {
        const index = firstRemovableHistoryIndex(output, protectedHistoryId);

        if (index < 0) {
            break;
        }

        const removedCost = removeHistoryPromptAt(output, itemCosts, index);
        tokenEstimate -= removedCost;
    }

    while (tokenEstimate > tokenBudget) {
        const index = firstRemovableInjectionIndex(output);

        if (index < 0) {
            break;
        }

        tokenEstimate -= itemCosts[index] ?? 0;
        output.splice(index, 1);
        itemCosts.splice(index, 1);
    }

    const promptMessages = output.map((item) => item.message);

    assertPromptMessagesWithinBudget(promptMessages, tokenBudget);

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
) {
    const tokenEstimate = estimateChatGenerationMessages(promptMessages);

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
