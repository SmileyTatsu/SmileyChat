import type { Message } from "#frontend/types";

import { compilePresetMessagesWithMetadata } from "../presets/compile";
import type { SmileyPreset } from "../presets/types";
import { applyPromptInjections } from "./injections";
import { createPromptOutletRegistry } from "./outlets";
import {
    estimateChatGenerationMessages,
    estimateMessage,
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
    const messages = trimMessagesForEstimatedContext({
        messages: processedContext.messages,
        reservedTokens: budget.reservedTokens,
        tokenBudget: processedContext.tokenBudget,
    });
    const outlets = createPromptOutletRegistry(injections);
    const compiled = compilePresetMessagesWithMetadata(processedContext.preset, {
        character: processedContext.character,
        generation: processedContext.generation,
        group: processedContext.group,
        metadata: processedContext.metadata ?? processedContext.chat.metadata,
        messages,
        mode: processedContext.mode,
        outlets,
        personaDescription: processedContext.persona.description,
        personaName: processedContext.persona.name,
        userStatus: processedContext.userStatus,
    });
    const promptMessages = applyPromptInjections(compiled, injections);
    const tokenEstimate = estimateChatGenerationMessages(promptMessages);

    return {
        debug: buildDebug({
            budget,
            injections,
            messages,
            sourceMessages: processedContext.messages,
            tokenEstimate,
        }),
        messages,
        promptMessages,
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

function trimMessagesForEstimatedContext({
    messages,
    reservedTokens,
    tokenBudget,
}: {
    messages: Message[];
    reservedTokens: number;
    tokenBudget: number;
}) {
    if (messages.length <= 1) {
        return messages;
    }

    const availableTokens = Math.max(0, Math.floor(tokenBudget - reservedTokens));
    const selected: Message[] = [];
    let selectedTokens = 0;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        const messageTokens = estimateMessage(message);

        if (selected.length > 0 && selectedTokens + messageTokens > availableTokens) {
            break;
        }

        selected.unshift(message);
        selectedTokens += messageTokens;
    }

    return selected.length > 0 ? selected : [messages[messages.length - 1]];
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
