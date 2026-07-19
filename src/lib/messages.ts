import {
    MessageRole,
    type ChatAttachment,
    type Message,
    type MessageMetadata,
    type MessageSwipe,
    type SmileyCharacter,
    type SmileyPersona,
} from "../types";
import type { ToolActivity } from "./connections/types";

import { createId } from "./common/ids";
import { getCharacterDialogueColor } from "./characters/normalize";

export function createUserMessage(
    content: string,
    persona: SmileyPersona,
    attachments?: ChatAttachment[],
): Message {
    return createMessage(
        MessageRole.User,
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
    character?: Pick<SmileyCharacter, "id" | "avatar" | "data">,
): Message {
    const dialogueColor = character
        ? getCharacterDialogueColor(character as SmileyCharacter)
        : undefined;
    return createMessage(
        MessageRole.Character,
        author,
        content,
        {
            authorAvatarPath: character?.avatar?.path,
            authorCharacterId: character?.id,
        },
        undefined,
        attachments,
        dialogueColor ? { authorDialogueColorSnapshot: dialogueColor } : undefined,
    );
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
    if (role === MessageRole.User) {
        return createMessage(
            MessageRole.User,
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

    if (role === MessageRole.System) {
        return createMessage(
            MessageRole.Character,
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

    const dialogueColor = getCharacterDialogueColor(options.activeCharacter);

    return createMessage(
        MessageRole.Character,
        options.authorName?.trim() || options.activeCharacter.data.name,
        content,
        {
            authorAvatarPath: options.avatarPath || options.activeCharacter.avatar?.path,
            authorCharacterId: options.activeCharacter.id,
        },
        undefined,
        undefined,
        pluginMessageMetadata(options.pluginId, {
            includeInPrompt: options.includeInPrompt ?? true,
            promptRole: options.promptRole ?? "assistant",
            canGenerateSwipe: false,
            ...(dialogueColor ? { authorDialogueColorSnapshot: dialogueColor } : {}),
        }),
    );
}

export function createCharacterErrorMessage(author: string, content: string): Message {
    return createMessage(MessageRole.Character, author, content, undefined, "error");
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
    const dialogueColor = getCharacterDialogueColor(character);

    return {
        id: createId("character-greeting"),
        author: character.data.name,
        authorCharacterId: character.id,
        ...(character.avatar?.path ? { authorAvatarPath: character.avatar.path } : {}),
        ...(dialogueColor
            ? { metadata: { authorDialogueColorSnapshot: dialogueColor } }
            : {}),
        role: MessageRole.Character,
        createdAt,
        activeSwipeIndex: 0,
        swipes,
    };
}

function createMessageSwipe(
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

export function getMessageTimeline(message: Message) {
    const swipe = getActiveSwipe(message);

    if (!swipe) return [];
    if (swipe.timeline?.length) return swipe.timeline;

    return [
        ...(swipe.toolActivities ?? []).map((activity) => ({
            id: activity.call.id,
            type: "tool" as const,
            activity,
        })),
        ...(swipe.reasoning
            ? [
                  {
                      id: "legacy-thought",
                      type: "thought" as const,
                      content: swipe.reasoning,
                      ...(swipe.reasoningDetails !== undefined
                          ? { details: swipe.reasoningDetails }
                          : {}),
                  },
              ]
            : []),
    ];
}

export function getVisibleMessageTimeline(
    timeline: MessageSwipe["timeline"] | undefined,
    showThoughtProcess: boolean,
    showToolActivity: boolean,
) {
    if (!showThoughtProcess) return [];

    return (timeline ?? []).filter(
        (entry) =>
            (entry.type === "thought" && entry.content.length > 0) ||
            (entry.type === "tool" && showToolActivity),
    );
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
    toolActivities?: MessageSwipe["toolActivities"],
    timeline?: MessageSwipe["timeline"],
    pendingToolContinuation?: MessageSwipe["pendingToolContinuation"],
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
                    ...(toolActivities?.length ? { toolActivities } : {}),
                    ...(timeline?.length ? { timeline } : {}),
                    ...(pendingToolContinuation ? { pendingToolContinuation } : {}),
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
                      ...(toolActivities?.length ? { toolActivities } : {}),
                      ...(timeline?.length ? { timeline } : {}),
                      ...(pendingToolContinuation ? { pendingToolContinuation } : {}),
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

export function setActiveSwipePendingToolContinuation(
    message: Message,
    pendingToolContinuation: MessageSwipe["pendingToolContinuation"],
): Message {
    return {
        ...message,
        swipes: message.swipes.map((swipe, index) => {
            if (index !== message.activeSwipeIndex) return swipe;
            if (!pendingToolContinuation) {
                const { pendingToolContinuation: _pending, ...nextSwipe } = swipe;
                return nextSwipe;
            }
            return { ...swipe, pendingToolContinuation };
        }),
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
            swipes: [withSwipeAttachments(swipe, attachments)],
            activeSwipeIndex: 0,
        };
    }

    return {
        ...message,
        swipes: message.swipes.map((swipe, index) =>
            index === message.activeSwipeIndex
                ? withSwipeAttachments(swipe, attachments)
                : swipe,
        ),
    };
}

function withSwipeAttachments(swipe: MessageSwipe, attachments: ChatAttachment[]) {
    const nextSwipe = { ...swipe };
    delete nextSwipe.attachments;

    if (attachments.length > 0) {
        nextSwipe.attachments = attachments;
    }

    return nextSwipe;
}

export function appendMessageSwipe(
    message: Message,
    content: string,
    status?: MessageSwipe["status"],
    reasoning?: string,
    reasoningDetails?: unknown,
    toolActivities?: MessageSwipe["toolActivities"],
    timeline?: MessageSwipe["timeline"],
    pendingToolContinuation?: MessageSwipe["pendingToolContinuation"],
): Message {
    const swipe = createMessageSwipe(content, status);
    const swipes = [
        ...message.swipes,
        {
            ...swipe,
            ...(reasoning ? { reasoning } : {}),
            ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
            ...(toolActivities?.length ? { toolActivities } : {}),
            ...(timeline?.length ? { timeline } : {}),
            ...(pendingToolContinuation ? { pendingToolContinuation } : {}),
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
    authorMetadata?: Pick<
        Message,
        "authorAvatarPath" | "authorCharacterId" | "authorPersonaId"
    >,
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
        ...(authorMetadata?.authorCharacterId
            ? { authorCharacterId: authorMetadata.authorCharacterId }
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
