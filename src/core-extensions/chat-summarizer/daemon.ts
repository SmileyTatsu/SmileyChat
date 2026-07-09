import { getMessageContent } from "#frontend/lib/messages";
import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import type { SmileyPluginApi, PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { Message } from "#frontend/types";

import {
    defaultSummarizerSettings,
    defaultSummaryState,
    normalizeChatSummaryState,
    normalizeSummarizerSettings,
    summaryStorageKey,
    type ChatSummaryState,
    type SummarizerSettings,
    type SummaryRunMode,
} from "./settings";

type RunOptions = {
    mode: SummaryRunMode;
    snapshot?: PluginAppSnapshot;
};

type SummaryCacheListener = () => void;

const summaryCache = new Map<string, ChatSummaryState>();
const cacheListeners = new Set<SummaryCacheListener>();
const inFlightChatIds = new Set<string>();
const daemonTimers = new Map<string, number>();
let settingsCache = defaultSummarizerSettings;
let latestActiveChatId = "";

export function getSummarizerSettings() {
    return settingsCache;
}

export function getCachedActiveSummaryText() {
    return latestActiveChatId
        ? (summaryCache.get(latestActiveChatId)?.summaryText ?? "")
        : "";
}

export async function loadSummarizerSettings(api: SmileyPluginApi) {
    settingsCache = normalizeSummarizerSettings(
        await api.storage
            .getJson("settings", defaultSummarizerSettings)
            .catch(() => defaultSummarizerSettings),
    );
    return settingsCache;
}

export async function saveSummarizerSettings(
    api: SmileyPluginApi,
    patch: Partial<SummarizerSettings>,
) {
    settingsCache = normalizeSummarizerSettings({
        ...settingsCache,
        ...patch,
    });
    await api.storage.setJson("settings", settingsCache);
    notifySummaryCacheChanged();
    return settingsCache;
}

export async function getChatSummaryState(api: SmileyPluginApi, chatId: string) {
    const cached = summaryCache.get(chatId);

    if (cached) {
        return cached;
    }

    const state = normalizeChatSummaryState(
        await api.storage
            .getJson(summaryStorageKey(chatId), defaultSummaryState(chatId))
            .catch(() => defaultSummaryState(chatId)),
        chatId,
    );
    summaryCache.set(chatId, state);
    return state;
}

export async function saveChatSummaryState(
    api: SmileyPluginApi,
    chatId: string,
    state: ChatSummaryState,
) {
    const normalized = normalizeChatSummaryState(state, chatId);
    summaryCache.set(chatId, normalized);
    await api.storage.setJson(summaryStorageKey(chatId), normalized);
    notifySummaryCacheChanged();
    return normalized;
}

export async function clearChatSummaryState(api: SmileyPluginApi, chatId: string) {
    const state = defaultSummaryState(chatId);
    summaryCache.set(chatId, state);
    await api.storage.setJson(summaryStorageKey(chatId), state);
    notifySummaryCacheChanged();
    return state;
}

export function subscribeToSummaryCache(listener: SummaryCacheListener) {
    cacheListeners.add(listener);
    return () => cacheListeners.delete(listener);
}

export function startSummarizerDaemon(api: SmileyPluginApi) {
    const unsubscribe = api.state.subscribe((snapshot) => {
        latestActiveChatId = snapshot.activeChat?.id ?? "";

        if (latestActiveChatId) {
            void getChatSummaryState(api, latestActiveChatId);
        }

        const settings = getSummarizerSettings();

        if (settings.triggerMode !== "message-count" || !snapshot.activeChat) {
            return;
        }

        const chatId = snapshot.activeChat.id;
        const previousTimer = daemonTimers.get(chatId);

        if (previousTimer !== undefined) {
            window.clearTimeout(previousTimer);
        }

        const timer = window.setTimeout(() => {
            daemonTimers.delete(chatId);
            void maybeRunAutomaticSummary(api, snapshot);
        }, settings.debounceMs);
        daemonTimers.set(chatId, timer);
    });

    return () => {
        unsubscribe();
        for (const timer of daemonTimers.values()) {
            window.clearTimeout(timer);
        }
        daemonTimers.clear();
    };
}

export async function runSummarization(
    api: SmileyPluginApi,
    options: RunOptions,
): Promise<ChatSummaryState> {
    const snapshot = options.snapshot ?? api.state.getSnapshot();
    const chat = snapshot?.activeChat;

    if (!snapshot || !chat) {
        throw new Error("No active chat is available to summarize.");
    }

    const chatId = chat.id;

    if (inFlightChatIds.has(chatId)) {
        return getChatSummaryState(api, chatId);
    }

    inFlightChatIds.add(chatId);

    try {
        const settings = getSummarizerSettings();
        const previousState = await getChatSummaryState(api, chatId);
        await saveChatSummaryState(api, chatId, {
            ...previousState,
            status: "generating",
            error: undefined,
        });

        const eligibleMessages = eligibleMessagesForSummary(snapshot.messages, settings);
        let messagesToSummarize = messagesForRun(
            eligibleMessages,
            previousState,
            options.mode,
            settings,
        );

        if (messagesToSummarize.length === 0) {
            return saveChatSummaryState(api, chatId, {
                ...previousState,
                status: "idle",
                error: undefined,
            });
        }

        const previousSummary =
            options.mode === "full" || !settings.includePreviousSummary
                ? ""
                : previousState.summaryText;
        let generationMessages = buildSummaryGenerationMessages(
            settings,
            previousSummary,
            messagesToSummarize,
        );
        const profileRequest = settings.profileId
            ? { profileId: settings.profileId }
            : {};
        const tokenBudget = api.model.getContextBudget(profileRequest);

        while (
            api.model.estimateTokens(generationMessages) > tokenBudget &&
            messagesToSummarize.length > 1
        ) {
            messagesToSummarize = messagesToSummarize.slice(1);
            generationMessages = buildSummaryGenerationMessages(
                settings,
                previousSummary,
                messagesToSummarize,
            );
        }

        const result = await api.model.generate({
            messages: generationMessages,
            ...(settings.profileId ? { profileId: settings.profileId } : {}),
            ...(settings.presetId ? { presetId: settings.presetId } : {}),
            stream: settings.stream,
        });
        const lastMessage = messagesToSummarize[messagesToSummarize.length - 1];
        const summaryText = limitText(
            result.message.trim(),
            settings.maxSummaryCharacters,
        );

        return saveChatSummaryState(api, chatId, {
            version: 1,
            chatId,
            summaryText,
            lastSummarizedMessageId: lastMessage.id,
            lastSummarizedCreatedAt: lastMessage.createdAt,
            lastSummarizedAt: new Date().toISOString(),
            messageCountAtSummary: eligibleMessages.length,
            status: "idle",
        });
    } catch (error) {
        const currentState = await getChatSummaryState(api, chatId);
        return saveChatSummaryState(api, chatId, {
            ...currentState,
            status: "error",
            error:
                error instanceof Error
                    ? error.message
                    : "Could not generate chat summary.",
        });
    } finally {
        inFlightChatIds.delete(chatId);
    }
}

export function eligibleMessagesForSummary(
    messages: Message[],
    settings = getSummarizerSettings(),
) {
    return messages.filter((message) => {
        if (message.metadata?.includeInPrompt === false) {
            return false;
        }

        if (message.metadata?.promptRole === "none") {
            return false;
        }

        if (
            !settings.summarizeSystemMessages &&
            message.metadata?.displayRole === "system"
        ) {
            return false;
        }

        if (!settings.summarizeSystemMessages && message.role === "system") {
            return false;
        }

        return getMessageContent(message).trim().length > 0;
    });
}

export function unsummarizedMessageCount(
    messages: Message[],
    state: ChatSummaryState,
    settings = getSummarizerSettings(),
) {
    return messagesForRun(
        eligibleMessagesForSummary(messages, settings),
        state,
        "unsummarized",
        settings,
    ).length;
}

export function renderSummaryInjection(settings: SummarizerSettings, summary: string) {
    return renderTemplate(settings.injectionTemplate, {
        summary,
    }).trim();
}

export function buildSummaryGenerationMessages(
    settings: SummarizerSettings,
    previousSummary: string,
    messagesToSummarize: Message[],
): ChatGenerationMessage[] {
    const userPrompt = renderTemplate(settings.userPromptTemplate, {
        max_summary_characters: String(settings.maxSummaryCharacters),
        messages: formatMessagesForSummary(messagesToSummarize),
        previous_summary: previousSummary || "No previous summary.",
        summary: previousSummary,
    });

    return [
        {
            role: "system",
            content: settings.systemInstruction,
        },
        {
            role: "user",
            content: userPrompt,
        },
    ];
}

function messagesForRun(
    messages: Message[],
    state: ChatSummaryState,
    mode: SummaryRunMode,
    settings: SummarizerSettings,
) {
    const sourceMessages =
        mode === "full" ? messages : messagesAfterLastSummary(messages, state);

    return sourceMessages.slice(-settings.maxMessagesPerRun);
}

function messagesAfterLastSummary(messages: Message[], state: ChatSummaryState) {
    if (!state.lastSummarizedMessageId) {
        return messages;
    }

    const index = messages.findIndex(
        (message) => message.id === state.lastSummarizedMessageId,
    );

    if (index < 0) {
        return messages;
    }

    return messages.slice(index + 1);
}

async function maybeRunAutomaticSummary(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot,
) {
    const chat = snapshot.activeChat;

    if (!chat) {
        return;
    }

    const settings = getSummarizerSettings();
    const state = await getChatSummaryState(api, chat.id);

    if (state.status === "error" || state.status === "generating") {
        return;
    }

    const unsummarized = unsummarizedMessageCount(snapshot.messages, state, settings);

    if (unsummarized >= settings.triggerThreshold) {
        await runSummarization(api, { mode: "unsummarized", snapshot });
    }
}

function formatMessagesForSummary(messages: Message[]) {
    return messages
        .map((message) => {
            const role = message.metadata?.promptRole ?? promptRoleForMessage(message);
            const timestamp = message.createdAt;
            const author = message.author || role;
            const content = getMessageContent(message).trim();

            return `[${timestamp}] ${author} (${role}):\n${content}`;
        })
        .join("\n\n");
}

function promptRoleForMessage(message: Message) {
    if (message.role === "user") {
        return "user";
    }

    if (message.metadata?.displayRole === "system") {
        return "system";
    }

    return "assistant";
}

function renderTemplate(template: string, values: Record<string, string>) {
    return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key: string) => {
        const value = values[key.trim()];
        return value === undefined ? match : value;
    });
}

function limitText(text: string, maxCharacters: number) {
    if (text.length <= maxCharacters) {
        return text;
    }

    return text.slice(0, maxCharacters).trimEnd();
}

function notifySummaryCacheChanged() {
    for (const listener of cacheListeners) {
        listener();
    }
}
