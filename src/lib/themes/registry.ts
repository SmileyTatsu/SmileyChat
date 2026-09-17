import type { ChatThemeDefinition } from "./types";

export type { ChatThemeDefinition, ChatThemeId, ChatThemePreviewSample } from "./types";

export const DEFAULT_CHAT_THEME_ID = "chat";

export const AVAILABLE_CHAT_THEMES: readonly ChatThemeDefinition[] = [
    {
        id: "chat",
        name: "Chatting",
        badge: "Messenger",
        description:
            "Compact vertical stream inspired by modern messengers and Discord. Includes prominent avatars, compact bubbles, author headers, and real-time typing indicators.",
        preview: {
            author: "Luna",
            text: "The library lights dim as dusk falls outside. Shall we continue reviewing these notes?",
            quote: '"Shall we continue reviewing these notes?"',
            time: "10:24 PM",
        },
    },
    {
        id: "rp",
        name: "Roleplaying",
        badge: "Story / Document",
        description:
            "Calm, book-inspired layout designed for immersion and long-form narrative scenes. Features generous margins, left accent borders, and a reading-focused typographic flow.",
        preview: {
            author: "Luna",
            text: "The evening breeze whispers through the open window, stirring the papers scattered across the desk. Looking up with a gentle smile, she gestures toward the open armchair.",
            quote: '"Take a seat. We have all the time in the world."',
            time: "10:24 PM",
        },
    },
];

export function getChatTheme(id: string): ChatThemeDefinition {
    const found = AVAILABLE_CHAT_THEMES.find((theme) => theme.id === id);
    return found ?? AVAILABLE_CHAT_THEMES[0];
}

export function isValidChatTheme(id: string): boolean {
    return AVAILABLE_CHAT_THEMES.some((theme) => theme.id === id);
}
