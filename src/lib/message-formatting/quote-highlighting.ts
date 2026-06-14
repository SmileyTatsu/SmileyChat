import type { ComponentChild } from "preact";

import type { AppPreferences } from "#frontend/lib/preferences/types";
import type { ChatMode } from "#frontend/types";

export type MessageFormattingOptions = {
    highlightQuotes: boolean;
    italicizeMessages: boolean;
};

type H = typeof import("preact").h;

const quotePairs: Record<string, string> = {
    '"': '"',
    "\u201c": "\u201d",
};

export function messageFormattingForMode(
    preferences: AppPreferences,
    mode: ChatMode,
): MessageFormattingOptions {
    if (mode === "rp") {
        return {
            highlightQuotes: preferences.appearance.highlightQuotedTextInRp,
            italicizeMessages: preferences.appearance.italicizeRpMessages,
        };
    }

    return {
        highlightQuotes: preferences.appearance.highlightQuotedTextInChat,
        italicizeMessages: preferences.appearance.italicizeChatMessages,
    };
}

export function renderQuotedText(
    h: H,
    text: string,
    options: { enabled: boolean; className?: string },
): ComponentChild[] {
    if (!options.enabled || !text) {
        return [text];
    }

    const className = options.className ?? "message-quoted-text";
    const nodes: ComponentChild[] = [];
    let cursor = 0;
    let key = 0;

    while (cursor < text.length) {
        const opening = findOpeningQuote(text, cursor);

        if (!opening) {
            nodes.push(text.slice(cursor));
            break;
        }

        const closingQuote = quotePairs[opening.quote];
        const closingIndex = findClosingQuote(
            text,
            opening.index + opening.quote.length,
            closingQuote,
        );

        if (closingIndex < 0) {
            nodes.push(text.slice(cursor));
            break;
        }

        if (opening.index > cursor) {
            nodes.push(text.slice(cursor, opening.index));
        }

        const end = closingIndex + closingQuote.length;
        nodes.push(
            h(
                "span",
                {
                    className,
                    key: `quote-${key}`,
                },
                text.slice(opening.index, end),
            ),
        );

        key += 1;
        cursor = end;
    }

    return nodes.length ? nodes : [text];
}

function findOpeningQuote(text: string, startIndex: number) {
    for (let index = startIndex; index < text.length; index += 1) {
        const character = text[index];

        if (character === "\u201c") {
            return { index, quote: character };
        }

        if (character === '"' && isLikelyOpeningStraightQuote(text, index)) {
            return { index, quote: character };
        }
    }

    return undefined;
}

function findClosingQuote(text: string, startIndex: number, quote: string) {
    for (let index = startIndex; index < text.length; index += 1) {
        if (text[index] !== quote) {
            continue;
        }

        if (quote !== '"' || isLikelyClosingStraightQuote(text, index)) {
            return index;
        }
    }

    return -1;
}

function isLikelyOpeningStraightQuote(text: string, index: number) {
    const previous = text[index - 1];
    const next = text[index + 1];

    return !isWordCharacter(previous) && Boolean(next) && !/\s/.test(next);
}

function isLikelyClosingStraightQuote(text: string, index: number) {
    const previous = text[index - 1];

    return Boolean(previous) && !/\s/.test(previous);
}

function isWordCharacter(character: string | undefined) {
    return Boolean(character && /[\p{L}\p{N}_]/u.test(character));
}
