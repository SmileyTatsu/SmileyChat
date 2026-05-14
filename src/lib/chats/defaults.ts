import type { ChatMode, Message, SmileyCharacter } from "../../types";
import { createId } from "../common/ids";
import type { ChatSession } from "./types";

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
