import type { ChatGenerationMessageRole } from "#frontend/lib/connections/types";

export type SummarizerTriggerMode = "message-count" | "manual";
export type SummaryRunMode = "unsummarized" | "full";

export type SummarizerSettings = {
    version: 1;
    triggerMode: SummarizerTriggerMode;
    triggerThreshold: number;
    debounceMs: number;
    profileId: string;
    presetId: string;
    stream: boolean;
    includePreviousSummary: boolean;
    maxMessagesPerRun: number;
    maxSummaryCharacters: number;
    summarizeSystemMessages: boolean;
    systemInstruction: string;
    userPromptTemplate: string;
    injectionEnabled: boolean;
    injectionRole: ChatGenerationMessageRole;
    injectionDepth: number;
    injectionOrder: number;
    injectionPriority: number;
    injectionTemplate: string;
    macroEnabled: boolean;
};

export type ChatSummaryStatus = "idle" | "generating" | "error";

export type ChatSummaryState = {
    version: 1;
    chatId: string;
    summaryText: string;
    lastSummarizedMessageId?: string;
    lastSummarizedCreatedAt?: string;
    lastSummarizedAt?: string;
    messageCountAtSummary?: number;
    status: ChatSummaryStatus;
    error?: string;
};

export const summaryMacroName = "chat_summary";

export const defaultSystemInstruction = `You maintain a compact memory summary for a roleplay/chat conversation.

Preserve stable facts, character relationships, promises, plans, secrets, locations, inventory, injuries, emotional state, unresolved plot threads, and user preferences.
Do not invent facts. Do not include generic filler. Prefer concise bullets or short paragraphs.
If the previous summary conflicts with newer messages, trust the newer messages.`;

export const defaultUserPromptTemplate = `Previous summary:
{{previous_summary}}

New conversation messages:
{{messages}}

Write the updated summary. Keep it under {{max_summary_characters}} characters.`;

export const defaultInjectionTemplate = `[Previous Context Summary]
{{summary}}`;

export const defaultSummarizerSettings: SummarizerSettings = {
    version: 1,
    triggerMode: "manual",
    triggerThreshold: 50,
    debounceMs: 1500,
    profileId: "",
    presetId: "",
    stream: false,
    includePreviousSummary: true,
    maxMessagesPerRun: 80,
    maxSummaryCharacters: 6000,
    summarizeSystemMessages: false,
    systemInstruction: defaultSystemInstruction,
    userPromptTemplate: defaultUserPromptTemplate,
    injectionEnabled: true,
    injectionRole: "system",
    injectionDepth: 4,
    injectionOrder: 0,
    injectionPriority: 20,
    injectionTemplate: defaultInjectionTemplate,
    macroEnabled: true,
};

export function normalizeSummarizerSettings(value: unknown): SummarizerSettings {
    const source = isRecord(value) ? value : {};

    return {
        version: 1,
        triggerMode:
            source.triggerMode === "message-count" || source.triggerMode === "manual"
                ? source.triggerMode
                : defaultSummarizerSettings.triggerMode,
        triggerThreshold: integerValue(source.triggerThreshold, 1, 1000, 50),
        debounceMs: integerValue(source.debounceMs, 250, 30000, 1500),
        profileId: stringValue(source.profileId),
        presetId: stringValue(source.presetId),
        stream: booleanValue(source.stream, defaultSummarizerSettings.stream),
        includePreviousSummary: booleanValue(
            source.includePreviousSummary,
            defaultSummarizerSettings.includePreviousSummary,
        ),
        maxMessagesPerRun: integerValue(source.maxMessagesPerRun, 1, 1000, 80),
        maxSummaryCharacters: integerValue(source.maxSummaryCharacters, 500, 50000, 6000),
        summarizeSystemMessages: booleanValue(
            source.summarizeSystemMessages,
            defaultSummarizerSettings.summarizeSystemMessages,
        ),
        systemInstruction:
            stringValue(source.systemInstruction) ||
            defaultSummarizerSettings.systemInstruction,
        userPromptTemplate:
            stringValue(source.userPromptTemplate) ||
            defaultSummarizerSettings.userPromptTemplate,
        injectionEnabled: booleanValue(
            source.injectionEnabled,
            defaultSummarizerSettings.injectionEnabled,
        ),
        injectionRole: normalizeInjectionRole(source.injectionRole),
        injectionDepth: integerValue(source.injectionDepth, 0, 100, 4),
        injectionOrder: integerValue(source.injectionOrder, -10000, 10000, 0),
        injectionPriority: integerValue(source.injectionPriority, -10000, 10000, 20),
        injectionTemplate:
            stringValue(source.injectionTemplate) ||
            defaultSummarizerSettings.injectionTemplate,
        macroEnabled: booleanValue(source.macroEnabled, true),
    };
}

export function defaultSummaryState(chatId: string): ChatSummaryState {
    return {
        version: 1,
        chatId,
        summaryText: "",
        status: "idle",
    };
}

export function normalizeChatSummaryState(
    value: unknown,
    chatId: string,
): ChatSummaryState {
    const source = isRecord(value) ? value : {};

    return {
        version: 1,
        chatId,
        summaryText: stringValue(source.summaryText),
        lastSummarizedMessageId: optionalString(source.lastSummarizedMessageId),
        lastSummarizedCreatedAt: optionalString(source.lastSummarizedCreatedAt),
        lastSummarizedAt: optionalString(source.lastSummarizedAt),
        messageCountAtSummary:
            typeof source.messageCountAtSummary === "number" &&
            Number.isFinite(source.messageCountAtSummary)
                ? source.messageCountAtSummary
                : undefined,
        status:
            source.status === "generating" || source.status === "error"
                ? source.status
                : "idle",
        error: optionalString(source.error),
    };
}

export function summaryStorageKey(chatId: string) {
    return `summary-${chatId}`;
}

function normalizeInjectionRole(value: unknown): ChatGenerationMessageRole {
    return value === "developer" || value === "system" ? value : "system";
}

function integerValue(
    value: unknown,
    minimum: number,
    maximum: number,
    fallback: number,
) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function booleanValue(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
    const text = stringValue(value).trim();
    return text ? text : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
