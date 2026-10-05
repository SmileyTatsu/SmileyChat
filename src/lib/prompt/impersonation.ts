import type {
    ChatMode,
    Message,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import type { ChatGenerationRequest, ConnectionAdapter } from "../connections/types";
import { resolvePresetMacros } from "../presets/macros";

/** Reverse the participants for one request without changing saved chat data. */
export function createImpersonationContext({
    character,
    persona,
    messages,
    mode,
    userStatus,
}: {
    character: SmileyCharacter;
    persona: SmileyPersona;
    messages: Message[];
    mode: ChatMode;
    userStatus: UserStatus;
}) {
    const resolveOriginal = (content: string) =>
        resolvePresetMacros(content, {
            character,
            personaName: persona.name,
            personaDescription: persona.description,
            messages,
            mode,
            userStatus,
        });
    const impersonatedCharacter: SmileyCharacter = {
        ...character,
        id: persona.id,
        avatar: persona.avatar,
        data: {
            ...defaultCharacterData,
            name: persona.name,
            description: resolveOriginal(persona.description),
            scenario: resolveOriginal(character.data.scenario),
            mes_example: resolveOriginal(character.data.mes_example),
            // Preset/card instructions now address the persona through {{char}}.
            system_prompt: character.data.system_prompt,
            post_history_instructions: character.data.post_history_instructions,
            character_book: character.data.character_book
                ? {
                      ...character.data.character_book,
                      entries: character.data.character_book.entries.map((entry) => ({
                          ...entry,
                          content: resolveOriginal(entry.content),
                      })),
                  }
                : undefined,
        },
    };
    const otherParticipant: SmileyPersona = {
        ...persona,
        id: character.id,
        avatar: character.avatar,
        name: character.data.name,
        description: resolveOriginal(
            [character.data.description, character.data.personality]
                .filter(Boolean)
                .join("\n\n"),
        ),
    };
    const reversedMessages = messages
        // Transport-only tool messages cannot be replayed under reversed roles.
        .filter((message) => !message.toolCalls?.length && !message.toolResult)
        .map(
            (message): Message => ({
                ...message,
                role:
                    message.role === "user"
                        ? "character"
                        : message.role === "character"
                          ? "user"
                          : message.role,
                ...(message.metadata
                    ? {
                          metadata: {
                              ...message.metadata,
                              promptRole:
                                  message.metadata.promptRole === "assistant"
                                      ? "user"
                                      : message.metadata.promptRole === "user"
                                        ? "assistant"
                                        : message.metadata.promptRole,
                          },
                      }
                    : {}),
                swipes: message.swipes.map((swipe) => ({
                    ...swipe,
                    content: resolveOriginal(swipe.content),
                    reasoning: undefined,
                    reasoningDetails: undefined,
                    pendingToolContinuation: undefined,
                    // Keep generated-image context and pixel suppression, without tool execution.
                    toolActivities: swipe.toolActivities?.map((activity) => ({
                        ...activity,
                        result: { ...activity.result, suppressHistoryProtocol: true },
                    })),
                })),
            }),
        );
    return {
        character: impersonatedCharacter,
        persona: otherParticipant,
        messages: reversedMessages,
    };
}

/** Stream into a draft and settle immediately on abort, including during prompt preparation. */
export async function generateImpersonationDraft({
    buildRequest,
    connection,
    signal,
    onDraft,
}: {
    buildRequest: () => Promise<ChatGenerationRequest>;
    connection: ConnectionAdapter;
    signal: AbortSignal;
    onDraft: (content: string) => void;
}) {
    signal.throwIfAborted();
    let content = "";
    let rejectAbort: () => void;
    const aborted = new Promise<never>((_, reject) => {
        rejectAbort = () =>
            reject(new DOMException("The operation was aborted.", "AbortError"));
        signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const generate = async () => {
        const request = await buildRequest();
        signal.throwIfAborted();
        const result = await connection.generate({
            ...request,
            signal,
            // Draft generation cannot invoke tools that send or modify messages.
            tools: undefined,
            onToken: (token) => {
                if (signal.aborted) return;
                content += token;
                onDraft(content);
            },
        });
        signal.throwIfAborted();
        if (!result.message.trim() && !content.trim()) {
            throw new Error("The model returned no draft text. Try impersonating again.");
        }
        if (result.message) onDraft(result.message);
    };
    try {
        await Promise.race([generate(), aborted]);
    } finally {
        signal.removeEventListener("abort", rejectAbort!);
    }
}
