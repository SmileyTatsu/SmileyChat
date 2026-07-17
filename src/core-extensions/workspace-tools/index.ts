import { localApiFetch } from "#frontend/lib/api/client";
import { createBlankCharacter } from "#frontend/lib/characters/normalize";
import type { ChatSession, ChatSummary, SmileyCharacter } from "#frontend/types";
import type { Lorebook } from "#frontend/lib/lorebooks/types";
import { createBlankPersona } from "#frontend/lib/personas/defaults";
import type { SmileyPersona } from "#frontend/types";
import type { PluginTool, SmileyPluginApi } from "#frontend/lib/plugins/types";
import { workspaceToolsManifest } from "./manifest";

export { workspaceToolsManifest };

const stringParameters = (properties: Record<string, unknown>, required?: string[]) => ({
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties: false,
});

export function activate(api: SmileyPluginApi) {
    const tools: PluginTool[] = [
        {
            name: "read_active_persona",
            description: "Read the active user persona's ID, name, and description.",
            parameters: stringParameters({}),
            isAvailable: (snapshot) => Boolean(snapshot.persona),
            run: (_args, context) =>
                json({
                    id: context.persona.id,
                    name: context.persona.name,
                    description: context.persona.description,
                }),
        },
        {
            name: "update_active_persona",
            description: "Update the active user persona's name and description.",
            parameters: stringParameters(
                {
                    name: { type: "string" },
                    description: { type: "string" },
                },
                ["name", "description"],
            ),
            isAvailable: (snapshot) => Boolean(snapshot.persona),
            run: async (args, context) => {
                await api.actions.updatePersona(context.persona.id, {
                    name: requiredString(args, "name"),
                    description: requiredString(args, "description"),
                });
                return json({ ok: true, id: context.persona.id });
            },
        },
        {
            name: "list_personas",
            description: "List all saved personas with their IDs and names.",
            parameters: stringParameters({}),
            run: async () => {
                const collection = await loadPersonas();
                return json(
                    collection.personas.map(({ id, name }) => ({
                        id,
                        name,
                    })),
                );
            },
        },
        {
            name: "create_persona",
            description: "Create a new saved persona.",
            parameters: stringParameters(
                {
                    name: { type: "string" },
                    description: { type: "string" },
                },
                ["name"],
            ),
            run: async (args) => {
                const persona = createBlankPersona(requiredString(args, "name"));
                if ("description" in args) {
                    persona.description = requiredString(args, "description");
                }
                const createdPersona = await api.actions.createPersona(persona);
                return json({ ok: true, id: createdPersona.id });
            },
        },
        {
            name: "read_persona_card",
            description: "Read a saved persona by ID.",
            parameters: stringParameters({ personaId: { type: "string" } }, [
                "personaId",
            ]),
            run: async (args) =>
                json(await loadPersona(requiredString(args, "personaId"))),
        },
        {
            name: "search_personas",
            description:
                "Search saved personas by name or description and return matching IDs.",
            parameters: stringParameters({ query: { type: "string" } }, ["query"]),
            run: async (args) => {
                const query = requiredQuery(args);
                const personas = await loadPersonas();
                const matches = await Promise.all(
                    personas.personas.map(async (summary) => {
                        const persona = await loadPersona(summary.id);
                        return matchesQuery(query, persona.name, persona.description)
                            ? {
                                  id: persona.id,
                                  name: persona.name,
                                  description: persona.description,
                              }
                            : undefined;
                    }),
                );
                return json(
                    matches.filter((persona): persona is NonNullable<typeof persona> =>
                        Boolean(persona),
                    ),
                );
            },
        },
        {
            name: "update_persona",
            description: "Update a saved persona's name and description by ID.",
            parameters: stringParameters(
                {
                    personaId: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                },
                ["personaId"],
            ),
            run: async (args) => {
                const personaId = requiredString(args, "personaId");
                const patch = optionalStringPatch(args, ["name", "description"]);
                requirePatch(patch);
                await api.actions.updatePersona(personaId, patch);
                return json({ ok: true, id: personaId });
            },
        },
        {
            name: "read_character_card",
            description: "Read the active character card.",
            parameters: stringParameters({}),
            isAvailable: (snapshot) => Boolean(snapshot.character),
            run: (_args, context) => json(context.character.data),
        },
        {
            name: "list_characters",
            description: "List all saved characters with their IDs, names, and taglines.",
            parameters: stringParameters({}),
            run: async () => json((await loadCharacters()).characters),
        },
        {
            name: "create_character",
            description: "Create a new saved character card.",
            parameters: stringParameters(
                {
                    name: { type: "string" },
                    description: { type: "string" },
                    personality: { type: "string" },
                    scenario: { type: "string" },
                    first_mes: { type: "string" },
                    mes_example: { type: "string" },
                    creator_notes: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                },
                ["name"],
            ),
            run: async (args) => {
                const character = createBlankCharacter(requiredString(args, "name"));
                const patch = characterWritingPatch(args);
                Object.assign(character.data, patch);
                if ("tags" in args)
                    character.data.tags = requiredStringArray(args, "tags");
                const createdCharacter = await api.actions.createCharacter(character);
                return json({ ok: true, id: createdCharacter.id });
            },
        },
        {
            name: "search_characters",
            description:
                "Search saved characters by name, description, personality, scenario, or tags and return matching IDs.",
            parameters: stringParameters({ query: { type: "string" } }, ["query"]),
            run: async (args) => {
                const query = requiredQuery(args);
                const summaries = await loadCharacters();
                const matches = await Promise.all(
                    summaries.characters.map(async (summary) => {
                        const character = await loadCharacter(summary.id);
                        const data = character.data;
                        return matchesQuery(
                            query,
                            data.name,
                            data.description,
                            data.personality,
                            data.scenario,
                            ...data.tags,
                        )
                            ? {
                                  id: character.id,
                                  name: data.name,
                                  tagline: data.description,
                              }
                            : undefined;
                    }),
                );
                return json(
                    matches.filter(
                        (character): character is NonNullable<typeof character> =>
                            Boolean(character),
                    ),
                );
            },
        },
        {
            name: "read_character_card_by_id",
            description: "Read a saved character card by ID.",
            parameters: stringParameters({ characterId: { type: "string" } }, [
                "characterId",
            ]),
            run: async (args) =>
                json((await loadCharacter(requiredString(args, "characterId"))).data),
        },
        {
            name: "update_character_card",
            description:
                "Update the editable writing fields on the active character card.",
            parameters: stringParameters({
                scenario: { type: "string" },
                personality: { type: "string" },
                description: { type: "string" },
                mes_example: { type: "string" },
                first_mes: { type: "string" },
                creator_notes: { type: "string" },
            }),
            isAvailable: (snapshot) => Boolean(snapshot.character),
            run: async (args, context) => {
                const patch = optionalStringPatch(args, [
                    "scenario",
                    "personality",
                    "description",
                    "mes_example",
                    "first_mes",
                    "creator_notes",
                ]);
                requirePatch(patch);
                await api.actions.updateCharacter(context.character.id, patch);
                return json({ ok: true, id: context.character.id });
            },
        },
        {
            name: "update_character_card_by_id",
            description:
                "Update editable writing fields on any saved character card by ID.",
            parameters: stringParameters(
                {
                    characterId: { type: "string" },
                    scenario: { type: "string" },
                    personality: { type: "string" },
                    description: { type: "string" },
                    mes_example: { type: "string" },
                    first_mes: { type: "string" },
                    creator_notes: { type: "string" },
                },
                ["characterId"],
            ),
            run: async (args) => {
                const characterId = requiredString(args, "characterId");
                const patch = characterWritingPatch(args);
                requirePatch(patch);
                await api.actions.updateCharacter(characterId, patch);
                return json({ ok: true, id: characterId });
            },
        },
        {
            name: "list_lorebooks",
            description:
                "List available lorebooks with their IDs, titles, and descriptions.",
            parameters: stringParameters({}),
            isAvailable: (snapshot) => snapshot.lorebooks.lorebooks.length > 0,
            run: (_args, context) =>
                json(
                    context.lorebooks.lorebooks.map(({ id, title, description }) => ({
                        id,
                        title,
                        description,
                    })),
                ),
        },
        {
            name: "search_lorebook_entries",
            description:
                "Search a lorebook's entries by title, content, or keys without loading unrelated entries.",
            parameters: stringParameters(
                {
                    lorebookId: { type: "string" },
                    keyword: { type: "string" },
                },
                ["lorebookId", "keyword"],
            ),
            run: async (args) => {
                const lorebookId = requiredString(args, "lorebookId");
                const keyword = requiredString(args, "keyword")
                    .trim()
                    .toLocaleLowerCase();
                if (!keyword) throw new Error("keyword must not be empty.");

                const lorebook = await loadLorebook(lorebookId);
                const matches = lorebook.entries
                    .filter((entry) => entryMatches(entry, keyword))
                    .map(({ id, title, keys, content }) => ({
                        id,
                        title,
                        keys,
                        content,
                    }));
                return json(matches);
            },
        },
        {
            name: "search_lorebooks",
            description:
                "Search available lorebooks by title or description and return matching IDs.",
            parameters: stringParameters({ query: { type: "string" } }, ["query"]),
            run: (args, context) => {
                const query = requiredQuery(args);
                return json(
                    context.lorebooks.lorebooks.filter((lorebook) =>
                        matchesQuery(query, lorebook.title, lorebook.description),
                    ),
                );
            },
        },
        {
            name: "create_lorebook",
            description: "Create a new lorebook.",
            parameters: stringParameters(
                { title: { type: "string" }, description: { type: "string" } },
                ["title", "description"],
            ),
            run: async (args) => {
                const lorebook = await api.actions.createLorebook({
                    title: requiredString(args, "title"),
                    description: requiredString(args, "description"),
                });
                return json({ ok: true, id: lorebook.id });
            },
        },
        {
            name: "add_lorebook_entry",
            description: "Add an entry to a lorebook.",
            parameters: stringParameters(
                {
                    lorebookId: { type: "string" },
                    title: { type: "string" },
                    keys: { type: "array", items: { type: "string" } },
                    content: { type: "string" },
                },
                ["lorebookId", "title", "keys", "content"],
            ),
            run: async (args) => {
                const lorebookId = requiredString(args, "lorebookId");
                await api.actions.addLorebookEntry(lorebookId, {
                    title: requiredString(args, "title"),
                    keys: requiredStringArray(args, "keys"),
                    content: requiredString(args, "content"),
                });
                return json({ ok: true, id: lorebookId });
            },
        },
        {
            name: "update_lorebook_entry",
            description: "Update a lorebook entry's title, keys, and content.",
            parameters: stringParameters(
                {
                    lorebookId: { type: "string" },
                    entryId: { type: "string" },
                    title: { type: "string" },
                    keys: { type: "array", items: { type: "string" } },
                    content: { type: "string" },
                },
                ["lorebookId", "entryId", "title", "keys", "content"],
            ),
            run: async (args) => {
                const lorebookId = requiredString(args, "lorebookId");
                const entryId = requiredString(args, "entryId");
                await api.actions.updateLorebookEntry(lorebookId, entryId, {
                    title: requiredString(args, "title"),
                    keys: requiredStringArray(args, "keys"),
                    content: requiredString(args, "content"),
                });
                return json({ ok: true, id: entryId });
            },
        },
        {
            name: "delete_lorebook_entry",
            description: "Delete an entry from a lorebook.",
            parameters: stringParameters(
                { lorebookId: { type: "string" }, entryId: { type: "string" } },
                ["lorebookId", "entryId"],
            ),
            run: async (args) => {
                const lorebookId = requiredString(args, "lorebookId");
                const entryId = requiredString(args, "entryId");
                await api.actions.deleteLorebookEntry(lorebookId, entryId);
                return json({ ok: true, id: entryId });
            },
        },
        {
            name: "update_chat_metadata",
            description: "Update the active chat's title and metadata.",
            parameters: stringParameters({
                title: { type: "string" },
                metadata: { type: "object", additionalProperties: true },
            }),
            isAvailable: (snapshot) => Boolean(snapshot.activeChat),
            run: async (args, context) => {
                const patch: Record<string, unknown> = {};
                if ("title" in args) patch.title = requiredString(args, "title");
                if ("metadata" in args) patch.metadata = requiredObject(args, "metadata");
                requirePatch(patch);
                await api.actions.updateChatMetadata(context.activeChat!.id, patch);
                return json({ ok: true, id: context.activeChat!.id });
            },
        },
        {
            name: "list_chats",
            description:
                "List saved chats with IDs, titles, character IDs, modes, and message counts.",
            parameters: stringParameters({}),
            run: async () => json((await loadChats()).chats),
        },
        {
            name: "search_chats",
            description:
                "Search saved chats by title and return matching chat summaries.",
            parameters: stringParameters({ query: { type: "string" } }, ["query"]),
            run: async (args) => {
                const query = requiredQuery(args);
                return json(
                    (await loadChats()).chats.filter((chat) =>
                        matchesQuery(query, chat.title ?? "", chat.defaultTitle),
                    ),
                );
            },
        },
        {
            name: "read_chat_metadata",
            description:
                "Read a saved chat's metadata and basic session details by ID, without loading messages.",
            parameters: stringParameters({ chatId: { type: "string" } }, ["chatId"]),
            run: async (args) => {
                const chat = await loadChat(requiredString(args, "chatId"));
                return json({
                    id: chat.id,
                    title: chat.title,
                    defaultTitle: chat.defaultTitle,
                    characterId: chat.characterId,
                    mode: chat.mode,
                    metadata: chat.metadata,
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt,
                });
            },
        },
        {
            name: "update_chat_metadata_by_id",
            description: "Update a saved chat's title and metadata by ID.",
            parameters: stringParameters(
                {
                    chatId: { type: "string" },
                    title: { type: "string" },
                    metadata: { type: "object", additionalProperties: true },
                },
                ["chatId"],
            ),
            run: async (args) => {
                const chatId = requiredString(args, "chatId");
                const patch = chatMetadataPatch(args);
                requirePatch(patch);
                await api.actions.updateChatMetadata(chatId, patch);
                return json({ ok: true, id: chatId });
            },
        },
        {
            name: "inject_system_note",
            description:
                "Add a visible out-of-character system note to the active chat without including it in the model prompt.",
            parameters: stringParameters({ content: { type: "string" } }, ["content"]),
            isAvailable: (snapshot) => Boolean(snapshot.activeChat),
            run: async (args) => {
                await api.actions.injectMessage(
                    "system",
                    requiredString(args, "content"),
                    {
                        includeInPrompt: false,
                    },
                );
                return json({ ok: true });
            },
        },
        {
            name: "set_character_presence",
            description: "Set the active character's displayed presence status.",
            parameters: stringParameters(
                {
                    status: {
                        type: "string",
                        enum: ["online", "away", "dnd", "offline"],
                    },
                },
                ["status"],
            ),
            isAvailable: (snapshot) => Boolean(snapshot.character),
            run: (args) => {
                const status = requiredString(args, "status");
                if (!isPresenceStatus(status))
                    throw new Error("Invalid presence status.");
                api.actions.setCharacterPresence(status);
                return json({ ok: true, status });
            },
        },
    ];

    const disposers = tools.map((tool) => api.tools.registerTool(tool));
    return () => disposers.forEach((dispose) => dispose());
}

async function loadLorebook(lorebookId: string) {
    const response = await localApiFetch(
        `/api/lorebooks/${encodeURIComponent(lorebookId)}`,
    );
    if (!response.ok) {
        const error = (await response.json().catch(() => undefined)) as
            | { error?: string }
            | undefined;
        throw new Error(error?.error ?? `Could not load lorebook (${response.status}).`);
    }
    return response.json() as Promise<Lorebook>;
}

async function loadPersonas() {
    const response = await localApiFetch("/api/personas");
    if (!response.ok) throw new Error(`Could not load personas (${response.status}).`);
    return response.json() as Promise<{ personas: Array<{ id: string; name: string }> }>;
}

async function loadPersona(personaId: string) {
    const response = await localApiFetch(
        `/api/personas/${encodeURIComponent(personaId)}`,
    );
    if (!response.ok) {
        const error = (await response.json().catch(() => undefined)) as
            | { error?: string }
            | undefined;
        throw new Error(error?.error ?? `Could not load persona (${response.status}).`);
    }
    return response.json() as Promise<SmileyPersona>;
}

async function loadCharacters() {
    const response = await localApiFetch("/api/characters");
    if (!response.ok) throw new Error(`Could not load characters (${response.status}).`);
    return response.json() as Promise<{
        characters: Array<{ id: string; name: string; tagline: string }>;
    }>;
}

async function loadCharacter(characterId: string) {
    const response = await localApiFetch(
        `/api/characters/${encodeURIComponent(characterId)}`,
    );
    if (!response.ok) {
        throw new Error(`Could not load character (${response.status}).`);
    }
    return response.json() as Promise<SmileyCharacter>;
}

async function loadChats() {
    const response = await localApiFetch("/api/chats");
    if (!response.ok) throw new Error(`Could not load chats (${response.status}).`);
    return response.json() as Promise<{ chats: ChatSummary[] }>;
}

async function loadChat(chatId: string) {
    const response = await localApiFetch(`/api/chats/${encodeURIComponent(chatId)}`);
    if (!response.ok) throw new Error(`Could not load chat (${response.status}).`);
    return response.json() as Promise<ChatSession>;
}

function entryMatches(entry: Lorebook["entries"][number], keyword: string) {
    return [entry.title, entry.content, ...entry.keys].some((value) =>
        value.toLocaleLowerCase().includes(keyword),
    );
}

function requiredString(args: Record<string, unknown>, key: string) {
    const value = args[key];
    if (typeof value !== "string") throw new Error(`${key} must be a string.`);
    return value;
}

function requiredStringArray(args: Record<string, unknown>, key: string) {
    const value = args[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`${key} must be an array of strings.`);
    }
    return value;
}

function requiredObject(args: Record<string, unknown>, key: string) {
    const value = args[key];
    if (!value || Array.isArray(value) || typeof value !== "object") {
        throw new Error(`${key} must be an object.`);
    }
    return value as Record<string, unknown>;
}

function optionalStringPatch(args: Record<string, unknown>, keys: string[]) {
    return Object.fromEntries(
        keys.filter((key) => key in args).map((key) => [key, requiredString(args, key)]),
    );
}

function characterWritingPatch(args: Record<string, unknown>) {
    return optionalStringPatch(args, [
        "scenario",
        "personality",
        "description",
        "mes_example",
        "first_mes",
        "creator_notes",
    ]);
}

function chatMetadataPatch(args: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    if ("title" in args) patch.title = requiredString(args, "title");
    if ("metadata" in args) patch.metadata = requiredObject(args, "metadata");
    return patch;
}

function requiredQuery(args: Record<string, unknown>) {
    const query = requiredString(args, "query").trim().toLocaleLowerCase();
    if (!query) throw new Error("query must not be empty.");
    return query;
}

function matchesQuery(query: string, ...values: string[]) {
    return values.some((value) => value.toLocaleLowerCase().includes(query));
}

function requirePatch(patch: Record<string, unknown>) {
    if (Object.keys(patch).length === 0)
        throw new Error("Provide at least one field to update.");
}

function isPresenceStatus(value: string): value is "online" | "away" | "dnd" | "offline" {
    return ["online", "away", "dnd", "offline"].includes(value);
}

function json(value: unknown) {
    return JSON.stringify(value);
}

export const workspaceToolsPlugin = {
    manifest: workspaceToolsManifest,
    module: { activate },
};
