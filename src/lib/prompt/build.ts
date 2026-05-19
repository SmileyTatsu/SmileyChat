import type { Message } from "#frontend/types";

import type { ChatGenerationMessage } from "../connections/types";
import { compilePresetMessagesWithMetadata } from "../presets/compile";
import type { SmileyPreset } from "../presets/types";
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
    const outlets = createPromptOutletRegistry(injections);
    const compiled = compilePresetMessagesWithMetadata(processedContext.preset, {
        character: processedContext.character,
        generation: processedContext.generation,
        group: processedContext.group,
        metadata: processedContext.metadata ?? processedContext.chat.metadata,
        messages: processedContext.messages,
        mode: processedContext.mode,
        outlets,
        personaDescription: processedContext.persona.description,
        personaName: processedContext.persona.name,
        userStatus: processedContext.userStatus,
    });
    const promptItems = applyPromptInjectionsWithMetadata(compiled, injections);
    const trimmedPrompt = trimAssembledPromptForEstimatedContext({
        messages: processedContext.messages,
        promptItems,
        tokenBudget: processedContext.tokenBudget,
    });

    return {
        debug: buildDebug({
            budget,
            injections,
            messages: trimmedPrompt.messages,
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

function trimAssembledPromptForEstimatedContext({
    messages,
    promptItems,
    tokenBudget,
}: {
    messages: Message[];
    promptItems: AnchoredPromptMessage[];
    tokenBudget: number;
}) {
    const output = [...promptItems];
    const protectedHistoryId = protectedHistoryMessageId(messages);
    let tokenEstimate = estimateAnchoredPromptMessages(output);

    while (tokenEstimate > tokenBudget) {
        const index = firstRemovableHistoryIndex(output, protectedHistoryId);

        if (index < 0) {
            break;
        }

        output.splice(index, 1);
        tokenEstimate = estimateAnchoredPromptMessages(output);
    }

    while (tokenEstimate > tokenBudget) {
        const index = firstRemovableInjectionIndex(output);

        if (index < 0) {
            break;
        }

        output.splice(index, 1);
        tokenEstimate = estimateAnchoredPromptMessages(output);
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
        promptMessages,
        tokenEstimate,
    };
}

function protectedHistoryMessageId(messages: Message[]) {
    const promptMessages = messages.filter(
        (message) =>
            message.metadata?.includeInPrompt !== false &&
            message.metadata?.promptRole !== "none",
    );

    for (let index = promptMessages.length - 1; index >= 0; index -= 1) {
        if (promptMessages[index].role === "user") {
            return promptMessages[index].id;
        }
    }

    return promptMessages[promptMessages.length - 1]?.id;
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

function estimateAnchoredPromptMessages(messages: AnchoredPromptMessage[]) {
    return messages.reduce(
        (total, item) => total + estimateGenerationMessage(item.message),
        0,
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

function buildDebug({
    budget,
    injections,
    messages,
    sourceMessages,
    tokenEstimate,
}: {
    budget: PromptBudgetPlan;
    injections: PromptInjection[];
    messages: Message[];
    sourceMessages: Message[];
    tokenEstimate: number;
}): PromptBuildDebug {
    const selectedMessageIds = new Set(messages.map((message) => message.id));

    return {
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

export function activePresetFromCollection(
    presets: SmileyPreset[],
    activePresetId: string,
) {
    return presets.find((preset) => preset.id === activePresetId);
}
