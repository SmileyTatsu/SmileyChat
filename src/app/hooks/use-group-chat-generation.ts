import { isGroupChat } from "#frontend/lib/chats/normalize";
import { getMessageContent } from "#frontend/lib/messages";
import { resolveCharacterCardMacros } from "#frontend/lib/presets/macros";
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
}): SmileyCharacter | undefined {
    if (!isGroupChat(sourceChat) || groupCharacters.length === 0) {
        return character;
    }

    if (forcedCharacterId) {
        return groupCharacters.find((item) => item.id === forcedCharacterId) ?? character;
    }

    const unmutedCharacters = (sourceChat.members ?? [])
        .slice()
        .sort((left, right) => left.order - right.order)
        .filter((member) => !member.muted)
        .map((member) => groupCharacters.find((item) => item.id === member.characterId))
        .filter((item): item is SmileyCharacter => item !== undefined);

    if (unmutedCharacters.length === 0) {
        return undefined;
    }

    const availableCharacters = eligibleGroupCharacters({
        groupCharacters,
        messages,
        sourceChat,
    });

    const candidates =
        availableCharacters.length > 0 ? availableCharacters : unmutedCharacters;
    const replyOrder = sourceChat.group?.replyOrder ?? "natural";

    if (replyOrder === "pooled") {
        return selectPooledGroupCharacter(unmutedCharacters, candidates, messages);
    }

    if (replyOrder === "natural") {
        return selectNaturalGroupCharacter(candidates, messages, sourceChat);
    }

    return selectListGroupCharacter(unmutedCharacters, candidates, messages);
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
        .map((member) => groupCharacters.find((item) => item.id === member.characterId))
        .filter(
            (item): item is SmileyCharacter =>
                item !== undefined && (allowSelfResponses || item.id !== lastSpeakerId),
        );
}

function selectListGroupCharacter(
    unmutedCharacters: SmileyCharacter[],
    availableCharacters: SmileyCharacter[],
    messages: Message[],
) {
    if (unmutedCharacters.length <= 1) {
        return unmutedCharacters[0];
    }

    const lastCharacterMessage = [...messages]
        .reverse()
        .find((message) => message.role === "character");

    if (!lastCharacterMessage) {
        return availableCharacters[0] ?? unmutedCharacters[0];
    }

    const lastIndex = unmutedCharacters.findIndex(
        (item) =>
            item.id === lastCharacterMessage.authorCharacterId ||
            item.data.name === lastCharacterMessage.author,
    );

    if (lastIndex === -1) {
        return availableCharacters[0] ?? unmutedCharacters[0];
    }

    for (let step = 1; step <= unmutedCharacters.length; step += 1) {
        const candidateIndex = (lastIndex + step) % unmutedCharacters.length;
        const candidate = unmutedCharacters[candidateIndex];
        if (availableCharacters.some((item) => item.id === candidate.id)) {
            return candidate;
        }
    }

    return unmutedCharacters[(lastIndex + 1) % unmutedCharacters.length];
}

function selectPooledGroupCharacter(
    unmutedCharacters: SmileyCharacter[],
    availableCharacters: SmileyCharacter[],
    messages: Message[],
) {
    if (unmutedCharacters.length <= 1) {
        return unmutedCharacters[0];
    }

    const unmutedIdSet = new Set(unmutedCharacters.map((c) => c.id));
    const nameToId = new Map(unmutedCharacters.map((c) => [c.data.name, c.id]));
    const currentCycleSpoken = new Set<string>();

    for (const msg of messages) {
        if (msg.role !== "character") {
            continue;
        }

        const canonicalId =
            (msg.authorCharacterId && unmutedIdSet.has(msg.authorCharacterId)
                ? msg.authorCharacterId
                : undefined) ?? nameToId.get(msg.author);

        if (!canonicalId) {
            continue;
        }

        if (currentCycleSpoken.has(canonicalId)) {
            // Member repeated before round completed; start new cycle with this member
            currentCycleSpoken.clear();
        }

        currentCycleSpoken.add(canonicalId);

        if (currentCycleSpoken.size >= unmutedCharacters.length) {
            // Full round completed; reset for the next cycle
            currentCycleSpoken.clear();
        }
    }

    const unspoken = availableCharacters.filter(
        (item) => !currentCycleSpoken.has(item.id),
    );
    const pool = unspoken.length > 0 ? unspoken : availableCharacters;

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

    if (matchesNameWithBoundaries(content, safeName)) {
        return true;
    }

    const cleanedName = safeName.replace(/[\(\[\{].*?[\)\]\}]/g, "").trim();
    if (
        cleanedName &&
        cleanedName !== safeName &&
        matchesNameWithBoundaries(content, cleanedName)
    ) {
        return true;
    }

    const firstName = (cleanedName || safeName).split(/\s+/)[0]?.trim();
    if (
        firstName &&
        firstName.length >= 3 &&
        firstName !== safeName &&
        matchesNameWithBoundaries(content, firstName)
    ) {
        return true;
    }

    return false;
}

function matchesNameWithBoundaries(content: string, name: string) {
    const escaped = escapeRegExp(name);
    const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`,
        "iu",
    );
    return pattern.test(content);
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
        .sort((left, right) => {
            const leftIsActive = left.characterId === activeSpeaker.id;
            const rightIsActive = right.characterId === activeSpeaker.id;

            if (leftIsActive && !rightIsActive) return -1;
            if (!leftIsActive && rightIsActive) return 1;

            return left.order - right.order;
        })
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
            // Character preset slots are separate, so every joined member block
            // belongs in one field. Keeping the remaining card fields empty
            // prevents descriptions, personalities, and instructions from being
            // regrouped by field during preset compilation.
            description: joinCharacterCards(
                orderedCharacters,
                sourceChat.group?.joinPrefix,
                sourceChat.group?.scenarioOverride,
            ),
            personality: "",
            scenario: sourceChat.group?.scenarioOverride || "",
            mes_example: activeSpeaker.data.mes_example,
            system_prompt: `This is a group chat. The active speaker for the next reply is ${activeSpeaker.data.name}.`,
            post_history_instructions: "",
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

function joinCharacterCards(
    characters: SmileyCharacter[],
    prefixTemplate: string | undefined,
    scenarioOverride: string | undefined,
) {
    const safePrefixTemplate = prefixTemplate ?? "{{char}}:";

    return characters
        .map((item) => {
            const prefix = safePrefixTemplate.replace(/\{\{char\}\}/g, item.data.name);
            const sections = [
                cardSection("Description", item.data.description, item),
                cardSection("Personality", item.data.personality, item),
                scenarioOverride ? "" : cardSection("Scenario", item.data.scenario, item),
                cardSection("System prompt", item.data.system_prompt, item),
                cardSection(
                    "Post-history instructions",
                    item.data.post_history_instructions,
                    item,
                ),
            ].filter(Boolean);

            return sections.length
                ? [prefix, sections.join("\n\n")].filter(Boolean).join("\n")
                : "";
        })
        .filter(Boolean)
        .join("\n\n");
}

function cardSection(label: string, value: string, character: SmileyCharacter) {
    const resolvedValue = resolveCharacterCardMacros(value, character).trim();

    return resolvedValue ? `${label}:\n${resolvedValue}` : "";
}
