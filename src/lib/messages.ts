import type { Message, MessageSwipe, SmileyCharacter, SmileyPersona } from "../types";
import { createId } from "./common/ids";

export function createUserMessage(content: string, persona: SmileyPersona): Message {
    return createMessage("user", persona.name.trim() || "Anon", content, {
        authorAvatarPath: persona.avatar?.path,
        authorPersonaId: persona.id,
    });
}

export function createCharacterMessage(author: string, content: string): Message {
    return createMessage("character", author, content);
}

export function createCharacterErrorMessage(author: string, content: string): Message {
    return createMessage("character", author, content, undefined, "error");
}

export function createCharacterGreetingMessage(
    character: SmileyCharacter,
    resolveContent: (content: string) => string = (content) => content,
): Message {
    const greetings = [
        character.data.first_mes,
        ...character.data.alternate_greetings,
    ].filter((greeting) => greeting.trim().length > 0);
    const fallbackGreeting = `${character.data.name || "The character"} is ready to chat.`;
    const createdAt = new Date().toISOString();
    const swipes = (greetings.length ? greetings : [fallbackGreeting]).map(
        (content, index) => ({
            id: createId(`greeting-${index + 1}`),
            content: resolveContent(content),
            createdAt,
        }),
    );

    return {
        id: createId("character-greeting"),
        author: character.data.name,
        role: "character",
        createdAt,
        activeSwipeIndex: 0,
        swipes,
    };
}

export function createMessageSwipe(
    content: string,
    status?: MessageSwipe["status"],
): MessageSwipe {
    return {
        id: createId("swipe"),
        content,
        createdAt: new Date().toISOString(),
        ...(status ? { status } : {}),
    };
}

export function getActiveSwipe(message: Message): MessageSwipe {
    return message.swipes[message.activeSwipeIndex] ?? message.swipes[0];
}

export function getMessageContent(message: Message) {
    return getActiveSwipe(message)?.content ?? "";
}

export function getMessageCreatedAt(message: Message) {
    return getActiveSwipe(message)?.createdAt ?? message.createdAt;
}

export function isActiveSwipeError(message: Message) {
    return getActiveSwipe(message)?.status === "error";
}

export function updateActiveSwipeContent(message: Message, content: string): Message {
    if (message.swipes.length === 0) {
        return {
            ...message,
            swipes: [createMessageSwipe(content)],
            activeSwipeIndex: 0,
        };
    }

    return {
        ...message,
        swipes: message.swipes.map((swipe, index) =>
            index === message.activeSwipeIndex
                ? {
                      ...swipe,
                      content,
                  }
                : swipe,
        ),
    };
}

export function appendMessageSwipe(
    message: Message,
    content: string,
    status?: MessageSwipe["status"],
): Message {
    const swipes = [...message.swipes, createMessageSwipe(content, status)];

    return {
        ...message,
        activeSwipeIndex: swipes.length - 1,
        swipes,
    };
}

function createMessage(
    role: Message["role"],
    author: string,
    content: string,
    authorMetadata?: Pick<Message, "authorAvatarPath" | "authorPersonaId">,
    status?: MessageSwipe["status"],
): Message {
    const createdAt = new Date().toISOString();

    return {
        id: createId(role),
        author,
        ...(authorMetadata?.authorAvatarPath
            ? { authorAvatarPath: authorMetadata.authorAvatarPath }
            : {}),
        ...(authorMetadata?.authorPersonaId
            ? { authorPersonaId: authorMetadata.authorPersonaId }
            : {}),
        role,
        createdAt,
        activeSwipeIndex: 0,
        swipes: [
            {
                id: createId("swipe"),
                content,
                createdAt,
                ...(status ? { status } : {}),
            },
        ],
    };
}
