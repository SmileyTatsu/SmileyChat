import { describe, expect, it } from "bun:test";

import {
    defaultAppPreferences,
    type AppPreferences,
} from "#frontend/lib/preferences/types";

import { messageFormattingForMode } from "./quote-highlighting";

function preferencesWith(
    appearance: Partial<AppPreferences["appearance"]>,
): AppPreferences {
    return {
        ...defaultAppPreferences,
        appearance: {
            ...defaultAppPreferences.appearance,
            ...appearance,
        },
    };
}

describe("messageFormattingForMode", () => {
    it("reads each mode's own display values", () => {
        const preferences = preferencesWith({
            highlightQuotedTextInChat: false,
            highlightQuotedTextInRp: true,
            italicizeChatMessages: false,
            italicizeRpMessages: true,
        });

        expect(messageFormattingForMode(preferences, "chat").highlightQuotes).toBe(false);
        expect(messageFormattingForMode(preferences, "rp").highlightQuotes).toBe(true);
        expect(messageFormattingForMode(preferences, "chat").italicizeMessages).toBe(
            false,
        );
        expect(messageFormattingForMode(preferences, "rp").italicizeMessages).toBe(true);
    });

    it("does not let the legacy value override a mode-specific one", () => {
        const preferences = preferencesWith({
            highlightQuotedText: true,
            highlightQuotedTextInChat: false,
            italicizeMessages: true,
            italicizeChatMessages: false,
        });

        expect(messageFormattingForMode(preferences, "chat").highlightQuotes).toBe(false);
        expect(messageFormattingForMode(preferences, "chat").italicizeMessages).toBe(
            false,
        );
    });

    it("falls back to the legacy value when a mode has none", () => {
        const preferences = preferencesWith({
            highlightQuotedText: true,
            highlightQuotedTextInChat: undefined,
            highlightQuotedTextInRp: undefined,
        });

        expect(messageFormattingForMode(preferences, "chat").highlightQuotes).toBe(true);
        expect(messageFormattingForMode(preferences, "rp").highlightQuotes).toBe(true);
    });
});
