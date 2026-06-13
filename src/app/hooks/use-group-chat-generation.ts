import { isGroupChat } from "#frontend/lib/chats/normalize";
import { getMessageContent } from "#frontend/lib/messages";
import type { ChatSession, Message, SmileyCharacter } from "#frontend/types";

export function selectGenerationCharacter({
    character,
    forcedCharacterId = "",
    groupCharacters,
    messages,
    sourceChat,
}: {
    character: SmileyCharacter;
    forcedCharacterId?: string;
    groupCharacters: SmileyCharacter[];
    messages: Message[];
    sourceChat: ChatSession;
}) {
    if (!isGroupChat(sourceChat) || groupCharacters.length === 0) {
        return character;
    }

    if (forcedCharacterId) {
        return groupCharacters.find((item) => item.id === forcedCharacterId) ?? character;
    }

    const availableCharacters = eligibleGroupCharacters({
        groupCharacters,
        messages,
        sourceChat,
    });

    if (availableCharacters.length === 0) {
        return groupCharacters[0] ?? character;
    }

    const replyOrder = sourceChat.group?.replyOrder ?? "list";

    if (replyOrder === "pooled") {
        return selectPooledGroupCharacter(availableCharacters, messages);
    }

    if (replyOrder === "natural") {
        return selectNaturalGroupCharacter(availableCharacters, messages, sourceChat);
    }

    return selectListGroupCharacter(availableCharacters, messages);
}

export function eligibleGroupCharacters({
    groupCharacters,
    messages,
    sourceChat,
}: {
    groupCharacters: SmileyCharacter[];
    messages: Message[];
    sourceChat: ChatSession;
}) {
    if (!isGroupChat(sourceChat)) {
        return [];
    }

    const lastMessage = messages[messages.length - 1];
    const lastSpeakerId =
        lastMessage?.role === "character"
            ? lastMessage.authorCharacterId ||
              groupCharacters.find((item) => item.data.name === lastMessage.author)?.id ||
              ""
            : "";
    const allowSelfResponses = sourceChat.group?.allowSelfResponses === true;

    return (sourceChat.members ?? [])
        .slice()
        .sort((left, right) => left.order - right.order)
        .filter((member) => !member.muted)
        .map((member) =>
            groupCharacters.find((item) => item.id === member.characterId),
        )
        .filter(
            (item): item is SmileyCharacter =>
                item !== undefined &&
                (allowSelfResponses || item.id !== lastSpeakerId),
        );
}

function selectListGroupCharacter(
    availableCharacters: SmileyCharacter[],
    messages: Message[],
) {
    const lastCharacterMessage = [...messages]
        .reverse()
        .find((message) => message.role === "character");
    const lastIndex = availableCharacters.findIndex(
        (item) =>
            item.id === lastCharacterMessage?.authorCharacterId ||
            item.data.name === lastCharacterMessage?.author,
    );

    return availableCharacters[(lastIndex + 1) % availableCharacters.length];
}

function selectPooledGroupCharacter(
    availableCharacters: SmileyCharacter[],
    messages: Message[],
) {
    const lastUserIndex = findLastIndex(
        messages,
        (message) => message.role === "user",
    );
    const spokenSinceUser = new Set(
        messages
            .slice(lastUserIndex + 1)
            .filter((message) => message.role === "character")
            .map((message) => message.authorCharacterId || message.author),
    );
    const unspoken = availableCharacters.filter(
        (item) => !spokenSinceUser.has(item.id) && !spokenSinceUser.has(item.data.name),
    );
    const pool = unspoken.length ? unspoken : availableCharacters;

    return pool[Math.floor(Math.random() * pool.length)];
}

function selectNaturalGroupCharacter(
    availableCharacters: SmileyCharacter[],
    messages: Message[],
    sourceChat: ChatSession,
) {
    const lastMessage = messages[messages.length - 1];
    const lastContent = lastMessage ? getMessageContent(lastMessage) : "";
    const mentioned = availableCharacters.filter((item) =>
        characterNameMentioned(lastContent, item.data.name),
    );

    if (mentioned.length) {
        return mentioned[Math.floor(Math.random() * mentioned.length)];
    }
    const activated = availableCharacters.filter((item) => {
        const talkativeness =
            sourceChat.members?.find((member) => member.characterId === item.id)
                ?.talkativeness ?? 0.5;
        return Math.random() < talkativeness;
    });
    const pool = activated.length ? activated : availableCharacters;

    return pool[Math.floor(Math.random() * pool.length)];
}

function characterNameMentioned(content: string, characterName: string) {
    const safeName = characterName.trim();

    if (!safeName) {
        return false;
    }

    return new RegExp(`\\b${escapeRegExp(safeName)}\\b`, "i").test(content);
}

export function promptCharacterForGeneration({
    activeSpeaker,
    groupCharacters,
    sourceChat,
}: {
    activeSpeaker: SmileyCharacter;
    groupCharacters: SmileyCharacter[];
    sourceChat: ChatSession;
}) {
    if (
        !isGroupChat(sourceChat) ||
        sourceChat.group?.generationMode !== "join-character-cards"
    ) {
        return sourceChat.group?.scenarioOverride
            ? {
                  ...activeSpeaker,
                  data: {
                      ...activeSpeaker.data,
                      scenario: sourceChat.group.scenarioOverride,
                  },
              }
            : activeSpeaker;
    }

    const memberIds = new Set(
        (sourceChat.members ?? []).map((member) => member.characterId),
    );
    const orderedCharacters = (sourceChat.members ?? [])
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((member) =>
            groupCharacters.find((character) => character.id === member.characterId),
        )
        .filter((item): item is SmileyCharacter => Boolean(item));

    if (orderedCharacters.length <= 1 || !memberIds.has(activeSpeaker.id)) {
        return activeSpeaker;
    }

    return {
        ...activeSpeaker,
        data: {
            ...activeSpeaker.data,
            description: joinCharacterField(
                orderedCharacters,
                sourceChat.group?.joinPrefix,
                "Description",
                (item) => item.data.description,
            ),
            personality: joinCharacterField(
                orderedCharacters,
                sourceChat.group?.joinPrefix,
                "Personality",
                (item) => item.data.personality,
            ),
            scenario:
                sourceChat.group?.scenarioOverride ||
                joinCharacterField(
                    orderedCharacters,
                    sourceChat.group?.joinPrefix,
                    "Scenario",
                    (item) => item.data.scenario,
                ),
            mes_example: activeSpeaker.data.mes_example,
            system_prompt: [
                `This is a group chat. The active speaker for the next reply is ${activeSpeaker.data.name}.`,
                joinCharacterField(
                    orderedCharacters,
                    sourceChat.group?.joinPrefix,
                    "System prompt",
                    (item) => item.data.system_prompt,
                ),
            ]
                .filter(Boolean)
                .join("\n\n"),
            post_history_instructions: [
                activeSpeaker.data.post_history_instructions,
                groupInstructionSections(orderedCharacters),
            ]
                .filter((part) => part.trim())
                .join("\n\n"),
        },
    };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (predicate(items[index])) {
            return index;
        }
    }

    return -1;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinCharacterField(
    characters: SmileyCharacter[],
    prefixTemplate: string | undefined,
    fieldName: string,
    valueForCharacter: (character: SmileyCharacter) => string,
) {
    const safePrefixTemplate = prefixTemplate ?? "{{char}}:";

    return characters
        .map((item) => {
            const value = valueForCharacter(item).trim();

            if (!value) {
                return "";
            }

            const prefix = safePrefixTemplate.replace(/\{\{char\}\}/g, item.data.name);

            return [prefix, `${fieldName}:\n${value}`].filter(Boolean).join("\n");
        })
        .filter(Boolean)
        .join("\n\n");
}

function groupInstructionSections(characters: SmileyCharacter[]) {
    return characters
        .map((character) => {
            const value = character.data.post_history_instructions.trim();

            if (!value) {
                return "";
            }

            return `Post-history instructions for ${character.data.name}:\n${value}`;
        })
        .filter(Boolean)
        .join("\n\n");
}
