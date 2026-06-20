import type { ChatMode, Message, SmileyCharacter } from "#frontend/types";

import { createId } from "../common/ids";
import { defaultGroupTitle } from "./normalize";
import type { ChatGroupMember, ChatSession, GroupGreetingMode } from "./types";

type CreateChatOptions = {
    character: SmileyCharacter;
    messages: Message[];
    mode: ChatMode;
};

export function createChatSession({
    character,
    messages,
    mode,
}: CreateChatOptions): ChatSession {
    const now = new Date().toISOString();

    return {
        id: createId("chat"),
        version: 1,
        characterId: character.id,
        defaultTitle: defaultChatTitle(character.data.name, now),
        mode,
        messages,
        createdAt: now,
        updatedAt: now,
    };
}

export function createGroupChatSession({
    characters,
    messages,
    mode,
    title,
    greetingMode = "all",
}: {
    characters: SmileyCharacter[];
    greetingMode?: GroupGreetingMode;
    messages: Message[];
    mode: ChatMode;
    title?: string;
}): ChatSession {
    const now = new Date().toISOString();
    const members: ChatGroupMember[] = characters.map((character, index) => ({
        characterId: character.id,
        name: character.data.name || "Character",
        ...(character.avatar?.path ? { avatarPath: character.avatar.path } : {}),
        order: index,
        talkativeness: 0.5,
    }));
    const defaultTitle = defaultGroupTitle(members);

    return {
        id: createId("chat"),
        version: 1,
        kind: "group",
        characterId: members[0]?.characterId ?? "",
        members,
        group: {
            autoResponses: {
                enabled: false,
                chance: 0.35,
                delayMs: 900,
                maxTurns: 2,
            },
            avatar: { type: "collage" },
            replyOrder: "natural",
            generationMode: "swap-character-cards",
            greetingMode,
            joinPrefix: "{{char}}:",
        },
        defaultTitle,
        ...(title?.trim() ? { title: title.trim() } : {}),
        mode,
        messages,
        createdAt: now,
        updatedAt: now,
    };
}

function defaultChatTitle(characterName: string, createdAt: string) {
    const date = new Date(createdAt);
    const formattedDate = new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
    }).format(date);

    return `Chat with ${characterName || "Character"} - ${formattedDate}`;
}
