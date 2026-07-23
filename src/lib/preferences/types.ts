import { isRecord } from "#frontend/lib/common/guards";
import type { ChatMode } from "#frontend/types";

export type MessageDensity = "compact" | "comfortable" | "spacious";
export type FontScale = "small" | "default" | "large";
export type TimeFormat = "12h" | "24h";

export type AppPreferences = {
    version: 1;
    appearance: {
        messageDensity: MessageDensity;
        showTimestamps: boolean;
        showRpCharacterImages: boolean;
        timeFormat: TimeFormat;
        fontScale: FontScale;
        highlightQuotedTextInChat: boolean;
        highlightQuotedTextInRp: boolean;
        italicizeChatMessages: boolean;
        italicizeRpMessages: boolean;
        uiFontFamily: string;
        chatFontFamily: string;
        codeblockFontFamily: string;
        customCss: string;
    };
    chat: {
        enterToSend: boolean;
        autoScroll: boolean;
        defaultMode: ChatMode;
        initialMessageCount: number;
        streaming: boolean;
        showThoughtProcess: boolean;
        showToolActivity: boolean;
        toolIterationLimit: number;
    };
    layout: {
        characterPanelOpenByDefault: boolean;
        railOrder: string[];
    };
    sillytavern: {
        enabled: boolean;
        basePath: string;
        userFolder: string;
        autoSyncOnStartup: boolean;
        syncTargets: {
            characters: boolean;
            chats: boolean;
            groupChats: boolean;
            personas: boolean;
            presets: boolean;
            lorebooks: boolean;
        };
        lastSyncedAt: string;
    };
};

export const defaultAppPreferences: AppPreferences = {
    version: 1,
    appearance: {
        messageDensity: "comfortable",
        showTimestamps: true,
        showRpCharacterImages: false,
        timeFormat: "12h",
        fontScale: "default",
        highlightQuotedTextInChat: true,
        highlightQuotedTextInRp: true,
        italicizeChatMessages: true,
        italicizeRpMessages: true,
        uiFontFamily: "",
        chatFontFamily: "",
        codeblockFontFamily: "",
        customCss: "",
    },
    chat: {
        enterToSend: true,
        autoScroll: true,
        defaultMode: "chat",
        initialMessageCount: 50,
        streaming: true,
        showThoughtProcess: true,
        showToolActivity: true,
        toolIterationLimit: 8,
    },
    layout: {
        characterPanelOpenByDefault: true,
        railOrder: [],
    },
    sillytavern: {
        enabled: true,
        basePath: "",
        userFolder: "default-user",
        autoSyncOnStartup: false,
        syncTargets: {
            characters: true,
            chats: true,
            groupChats: true,
            personas: true,
            presets: true,
            lorebooks: true,
        },
        lastSyncedAt: "",
    },
};

export function normalizeAppPreferences(value: unknown): AppPreferences {
    const preferences = isRecord(value) ? value : {};
    const appearance = isRecord(preferences.appearance) ? preferences.appearance : {};
    const chat = isRecord(preferences.chat) ? preferences.chat : {};
    const layout = isRecord(preferences.layout) ? preferences.layout : {};
    const sillytavern = isRecord(preferences.sillytavern) ? preferences.sillytavern : {};

    return {
        version: 1,
        appearance: {
            messageDensity: normalizeMessageDensity(
                appearance.messageDensity,
                defaultAppPreferences.appearance.messageDensity,
            ),
            showTimestamps: booleanOrFallback(
                appearance.showTimestamps,
                defaultAppPreferences.appearance.showTimestamps,
            ),
            showRpCharacterImages: booleanOrFallback(
                appearance.showRpCharacterImages,
                defaultAppPreferences.appearance.showRpCharacterImages,
            ),
            timeFormat: normalizeTimeFormat(
                appearance.timeFormat,
                defaultAppPreferences.appearance.timeFormat,
            ),
            fontScale: normalizeFontScale(
                appearance.fontScale,
                defaultAppPreferences.appearance.fontScale,
            ),
            highlightQuotedTextInChat: booleanOrFallback(
                appearance.highlightQuotedTextInChat,
                defaultAppPreferences.appearance.highlightQuotedTextInChat,
            ),
            highlightQuotedTextInRp: booleanOrFallback(
                appearance.highlightQuotedTextInRp,
                defaultAppPreferences.appearance.highlightQuotedTextInRp,
            ),
            italicizeChatMessages: booleanOrFallback(
                appearance.italicizeChatMessages,
                defaultAppPreferences.appearance.italicizeChatMessages,
            ),
            italicizeRpMessages: booleanOrFallback(
                appearance.italicizeRpMessages,
                defaultAppPreferences.appearance.italicizeRpMessages,
            ),
            uiFontFamily: normalizeFontFamily(
                appearance.uiFontFamily,
                defaultAppPreferences.appearance.uiFontFamily,
            ),
            chatFontFamily: normalizeFontFamily(
                appearance.chatFontFamily,
                defaultAppPreferences.appearance.chatFontFamily,
            ),
            codeblockFontFamily: normalizeFontFamily(
                appearance.codeblockFontFamily,
                defaultAppPreferences.appearance.codeblockFontFamily,
            ),
            customCss:
                typeof appearance.customCss === "string"
                    ? appearance.customCss
                    : defaultAppPreferences.appearance.customCss,
        },
        chat: {
            enterToSend: booleanOrFallback(
                chat.enterToSend,
                defaultAppPreferences.chat.enterToSend,
            ),
            autoScroll: booleanOrFallback(
                chat.autoScroll,
                defaultAppPreferences.chat.autoScroll,
            ),
            defaultMode: normalizeChatMode(
                chat.defaultMode,
                defaultAppPreferences.chat.defaultMode,
            ),
            initialMessageCount: numberInRange(
                chat.initialMessageCount,
                defaultAppPreferences.chat.initialMessageCount,
                20,
                300,
            ),
            streaming: booleanOrFallback(
                chat.streaming,
                defaultAppPreferences.chat.streaming,
            ),
            showThoughtProcess: booleanOrFallback(
                chat.showThoughtProcess,
                defaultAppPreferences.chat.showThoughtProcess,
            ),
            showToolActivity: booleanOrFallback(
                chat.showToolActivity,
                defaultAppPreferences.chat.showToolActivity,
            ),
            toolIterationLimit: numberInRange(
                chat.toolIterationLimit,
                defaultAppPreferences.chat.toolIterationLimit,
                1,
                32,
            ),
        },
        layout: {
            characterPanelOpenByDefault: booleanOrFallback(
                layout.characterPanelOpenByDefault,
                defaultAppPreferences.layout.characterPanelOpenByDefault,
            ),
            railOrder: normalizeRailOrder(layout.railOrder),
        },
        sillytavern: {
            enabled: booleanOrFallback(sillytavern.enabled, true),
            basePath:
                typeof sillytavern.basePath === "string" ? sillytavern.basePath : "",
            userFolder:
                typeof sillytavern.userFolder === "string"
                    ? sillytavern.userFolder
                    : "default-user",
            autoSyncOnStartup: booleanOrFallback(sillytavern.autoSyncOnStartup, false),
            syncTargets: Object.fromEntries(
                [
                    "characters",
                    "chats",
                    "groupChats",
                    "personas",
                    "presets",
                    "lorebooks",
                ].map((key) => [
                    key,
                    booleanOrFallback(
                        isRecord(sillytavern.syncTargets)
                            ? sillytavern.syncTargets[key]
                            : undefined,
                        true,
                    ),
                ]),
            ) as AppPreferences["sillytavern"]["syncTargets"],
            lastSyncedAt:
                typeof sillytavern.lastSyncedAt === "string"
                    ? sillytavern.lastSyncedAt
                    : "",
        },
    };
}

function normalizeRailOrder(value: unknown) {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((item): item is string => {
        const id = typeof item === "string" ? item.trim() : "";
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function normalizeMessageDensity(value: unknown, fallback: MessageDensity) {
    return value === "compact" || value === "comfortable" || value === "spacious"
        ? value
        : fallback;
}

function normalizeFontScale(value: unknown, fallback: FontScale) {
    return value === "small" || value === "default" || value === "large"
        ? value
        : fallback;
}

function normalizeTimeFormat(value: unknown, fallback: TimeFormat) {
    return value === "12h" || value === "24h" ? value : fallback;
}

function normalizeChatMode(value: unknown, fallback: ChatMode) {
    return value === "chat" || value === "rp" ? value : fallback;
}

function normalizeFontFamily(value: unknown, fallback: string) {
    if (typeof value !== "string") {
        return fallback;
    }

    return value
        .replace(/[\n\r\t]/g, " ")
        .replace(/[;{}]/g, "")
        .slice(0, 160);
}

function booleanOrFallback(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(value)));
}
