import { isRecord } from "#frontend/lib/common/guards";
import type { ChatMode } from "#frontend/types";

export type MessageDensity = "compact" | "comfortable" | "spacious";
export type FontScale = "small" | "default" | "large";

export type AppPreferences = {
    version: 1;
    appearance: {
        messageDensity: MessageDensity;
        showTimestamps: boolean;
        showRpCharacterImages: boolean;
        fontScale: FontScale;
        uiFontFamily: string;
        chatFontFamily: string;
    };
    chat: {
        enterToSend: boolean;
        autoScroll: boolean;
        defaultMode: ChatMode;
        initialMessageCount: number;
        streaming: boolean;
    };
    layout: {
        characterPanelOpenByDefault: boolean;
    };
};

export const defaultAppPreferences: AppPreferences = {
    version: 1,
    appearance: {
        messageDensity: "comfortable",
        showTimestamps: true,
        showRpCharacterImages: false,
        fontScale: "default",
        uiFontFamily: "",
        chatFontFamily: "",
    },
    chat: {
        enterToSend: true,
        autoScroll: true,
        defaultMode: "chat",
        initialMessageCount: 50,
        streaming: true,
    },
    layout: {
        characterPanelOpenByDefault: true,
    },
};

export function normalizeAppPreferences(value: unknown): AppPreferences {
    const preferences = isRecord(value) ? value : {};
    const appearance = isRecord(preferences.appearance) ? preferences.appearance : {};
    const chat = isRecord(preferences.chat) ? preferences.chat : {};
    const layout = isRecord(preferences.layout) ? preferences.layout : {};

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
            fontScale: normalizeFontScale(
                appearance.fontScale,
                defaultAppPreferences.appearance.fontScale,
            ),
            uiFontFamily: normalizeFontFamily(
                appearance.uiFontFamily,
                defaultAppPreferences.appearance.uiFontFamily,
            ),
            chatFontFamily: normalizeFontFamily(
                appearance.chatFontFamily,
                defaultAppPreferences.appearance.chatFontFamily,
            ),
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
        },
        layout: {
            characterPanelOpenByDefault: booleanOrFallback(
                layout.characterPanelOpenByDefault,
                defaultAppPreferences.layout.characterPanelOpenByDefault,
            ),
        },
    };
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

function numberInRange(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(value)));
}
