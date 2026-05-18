import type {
    ChatAttachment,
    Message,
    MessageMetadata,
    MessageSwipe,
    SmileyCharacter,
    SmileyPersona,
} from "../types";

import { createId } from "./common/ids";

export function createUserMessage(
    content: string,
    persona: SmileyPersona,
    attachments?: ChatAttachment[],
): Message {
    return createMessage(
        "user",
        persona.name.trim() || "Anon",
        content,
        {
            authorAvatarPath: persona.avatar?.path,
            authorPersonaId: persona.id,
        },
        undefined,
        attachments,
    );
}

export function createCharacterMessage(
    author: string,
    content: string,
    attachments?: ChatAttachment[],
): Message {
    return createMessage("character", author, content, undefined, undefined, attachments);
}

export function createInjectedMessage(
    role: "character" | "system" | "user",
    content: string,
    options: {
        activeCharacter: SmileyCharacter;
        persona: SmileyPersona;
        pluginId: string;
        authorName?: string;
        avatarPath?: string;
        includeInPrompt?: boolean;
        promptRole?: MessageMetadata["promptRole"];
    },
): Message {
    if (role === "user") {
        return createMessage(
            "user",
            options.authorName?.trim() || options.persona.name.trim() || "Anon",
            content,
            {
                authorAvatarPath: options.avatarPath || options.persona.avatar?.path,
                authorPersonaId: options.persona.id,
            },
            undefined,
            undefined,
            pluginMessageMetadata(options.pluginId, {
                includeInPrompt: options.includeInPrompt ?? true,
                promptRole: options.promptRole ?? "user",
                canGenerateSwipe: false,
            }),
        );
    }

    if (role === "system") {
        return createMessage(
            "character",
            options.authorName?.trim() || "System",
            content,
            {
                authorAvatarPath: options.avatarPath,
            },
            undefined,
            undefined,
            pluginMessageMetadata(options.pluginId, {
                displayRole: "system",
                includeInPrompt: options.includeInPrompt ?? false,
                promptRole:
                    options.promptRole ??
                    (options.includeInPrompt === true ? "system" : "none"),
                canGenerateSwipe: false,
            }),
        );
    }

    return createMessage(
        "character",
        options.authorName?.trim() || options.activeCharacter.data.name,
        content,
        {
            authorAvatarPath: options.avatarPath || options.activeCharacter.avatar?.path,
        },
        undefined,
        undefined,
        pluginMessageMetadata(options.pluginId, {
            includeInPrompt: options.includeInPrompt ?? true,
            promptRole: options.promptRole ?? "assistant",
            canGenerateSwipe: false,
        }),
    );
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

export function getMessageAttachments(message: Message) {
    return getActiveSwipe(message)?.attachments ?? [];
}

export function getMessageReasoning(message: Message) {
    return getActiveSwipe(message)?.reasoning ?? "";
}

export function getMessageReasoningDetails(message: Message) {
    return getActiveSwipe(message)?.reasoningDetails;
}

export function getMessageCreatedAt(message: Message) {
    return getActiveSwipe(message)?.createdAt ?? message.createdAt;
}

export function isActiveSwipeError(message: Message) {
    return getActiveSwipe(message)?.status === "error";
}

export function updateActiveSwipeContent(
    message: Message,
    content: string,
    status?: MessageSwipe["status"],
    reasoning?: string,
    reasoningDetails?: unknown,
): Message {
    if (message.swipes.length === 0) {
        const swipe = createMessageSwipe(content, status);

        return {
            ...message,
            swipes: [
                {
                    ...swipe,
                    ...(reasoning ? { reasoning } : {}),
                    ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
                },
            ],
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
                      ...(reasoning !== undefined ? { reasoning } : {}),
                      ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
                      ...(status ? { status } : {}),
                  }
                : swipe,
        ),
    };
}

export function updateActiveSwipeReasoning(
    message: Message,
    reasoning: string,
    reasoningDetails?: unknown,
): Message {
    if (message.swipes.length === 0) {
        const swipe = createMessageSwipe("");

        return {
            ...message,
            swipes: [
                {
                    ...swipe,
                    ...(reasoning ? { reasoning } : {}),
                    ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
                },
            ],
            activeSwipeIndex: 0,
        };
    }

    return {
        ...message,
        swipes: message.swipes.map((swipe, index) =>
            index === message.activeSwipeIndex
                ? {
                      ...swipe,
                      reasoning,
                      ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
                  }
                : swipe,
        ),
    };
}

export function updateActiveSwipeAttachments(
    message: Message,
    attachments: ChatAttachment[],
): Message {
    if (message.swipes.length === 0) {
        const swipe = createMessageSwipe("");

        return {
            ...message,
            swipes: [{ ...swipe, ...(attachments.length ? { attachments } : {}) }],
            activeSwipeIndex: 0,
        };
    }

    return {
        ...message,
        swipes: message.swipes.map((swipe, index) =>
            index === message.activeSwipeIndex
                ? {
                      ...swipe,
                      ...(attachments.length ? { attachments } : {}),
                  }
                : swipe,
        ),
    };
}

export function appendMessageSwipe(
    message: Message,
    content: string,
    status?: MessageSwipe["status"],
    reasoning?: string,
    reasoningDetails?: unknown,
): Message {
    const swipe = createMessageSwipe(content, status);
    const swipes = [
        ...message.swipes,
        {
            ...swipe,
            ...(reasoning ? { reasoning } : {}),
            ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
        },
    ];

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
    attachments?: ChatAttachment[],
    metadata?: MessageMetadata,
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
        ...(metadata ? { metadata } : {}),
        role,
        createdAt,
        activeSwipeIndex: 0,
        swipes: [
            {
                id: createId("swipe"),
                content,
                ...(attachments?.length ? { attachments } : {}),
                createdAt,
                ...(status ? { status } : {}),
            },
        ],
    };
}

function pluginMessageMetadata(
    pluginId: string,
    metadata: Omit<MessageMetadata, "origin" | "pluginId">,
): MessageMetadata {
    return {
        origin: "plugin",
        pluginId,
        ...metadata,
    };
}
