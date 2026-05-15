import { HttpError, json, parsePort, readJsonBody } from "./http";
import { createCsrfToken, verifyCsrfRequest } from "./csrf";
import { userDataDir } from "./paths";
import { serveStatic } from "./static";
import {
    createChat,
    deleteChatById,
    deleteChatsByCharacterId,
    readChatById,
    readChatSummaryCollection,
    updateChatIndex,
    writeChatById,
} from "./chat-store";
import {
    createCharacter,
    deleteCharacterById,
    exportCharacterCard,
    importDroppedCharacterFiles,
    importUploadedCharacterFiles,
    readCharacterById,
    readCharacterSummaryCollection,
    serveCharacterAvatar,
    updateCharacterIndex,
    writeCharacterAvatar,
    writeCharacterById,
} from "./characters";
import { characterToSummary } from "../src/lib/characters/normalize";
import {
    readConnectionSecrets,
    readConnectionSettings,
    readAppPreferences,
    readPresetCollection,
    writeConnectionSecrets,
    writeConnectionSettings,
    writeAppPreferences,
    writePresetCollection,
} from "./settings";
import {
    createPersona,
    deletePersonaById,
    readPersonaById,
    readPersonaSummaryCollection,
    updatePersonaIndex,
    writePersonaById,
} from "./persona-store";
import { writePersonaAvatar } from "./persona-avatar";
import { servePersonaAsset } from "./persona-images";
import { ensureUserData } from "./user-data";
import {
    deletePluginStorage,
    readPluginManifests,
    readPluginStorage,
    servePluginAsset,
    updatePluginEnabled,
    writePluginStorage,
} from "./plugins";

type ApiHandler<Path extends string, WebSocketData = undefined> = (
    request: Bun.BunRequest<Path>,
    server: Bun.Server<WebSocketData>,
) => Response | Promise<Response>;

const port = parsePort(process.env.SMILEYCHAT_API_PORT);

ensureUserData();
await importDroppedCharacterFiles();

const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    routes: {
        "/api/health": {
            GET: api(async () => {
                return json({ ok: true, userDataDir });
            }),
        },

        "/api/csrf": {
            GET: api(async () => {
                return json({ token: await createCsrfToken() });
            }),
        },

        "/api/plugins": {
            GET: api(async () => {
                return json({ plugins: await readPluginManifests() });
            }),
        },

        "/api/plugins/:pluginId": {
            PUT: api(async (request) => {
                const body = await readJsonBody(request);
                const enabled =
                    body && typeof body === "object" && "enabled" in body
                        ? body.enabled
                        : undefined;

                return updatePluginEnabled(request.params.pluginId, enabled);
            }),
        },

        "/api/plugins/:pluginId/storage/:key": {
            GET: api(async (request) => {
                return readPluginStorage(request.params.pluginId, request.params.key);
            }),

            PUT: api(async (request) => {
                const value = await readJsonBody(request);

                return writePluginStorage(
                    request.params.pluginId,
                    request.params.key,
                    value,
                );
            }),

            DELETE: api(async (request) => {
                return deletePluginStorage(request.params.pluginId, request.params.key);
            }),
        },

        "/api/connections": {
            GET: api(async () => {
                return json(await readConnectionSettings());
            }),

            PUT: api(async (request) => {
                const settings = await writeConnectionSettings(
                    await readJsonBody(request),
                );
                return json({ ok: true, settings });
            }),
        },

        "/api/connections/secrets": {
            GET: api(async () => {
                return json(await readConnectionSecrets());
            }),

            PUT: api(async (request) => {
                const secrets = await writeConnectionSecrets(await readJsonBody(request));
                return json({ ok: true, secrets });
            }),
        },

        "/api/presets": {
            GET: api(async () => {
                return json(await readPresetCollection());
            }),

            PUT: api(async (request) => {
                const presets = await writePresetCollection(await readJsonBody(request));
                return json({ ok: true, presets });
            }),
        },

        "/api/preferences": {
            GET: api(async () => {
                return json(await readAppPreferences());
            }),

            PUT: api(async (request) => {
                const preferences = await writeAppPreferences(
                    await readJsonBody(request),
                );
                return json({ ok: true, preferences });
            }),
        },

        "/api/chats": {
            GET: api(async () => {
                return json(await readChatSummaryCollection());
            }),

            POST: api(async (request) => {
                const result = await createChat(await readJsonBody(request));
                return json({ ok: true, ...result });
            }),
        },

        "/api/chats/index": {
            PUT: api(async (request) => {
                const index = await updateChatIndex(await readJsonBody(request));
                const chats = await readChatSummaryCollection();

                return json({ ok: true, index, chats });
            }),
        },

        "/api/chats/:chatId": {
            GET: api(async (request) => {
                const chat = await readChatById(request.params.chatId);
                return chat ? json(chat) : json({ error: "Chat not found." }, 404);
            }),

            PUT: api(async (request) => {
                const chat = await writeChatById(
                    request.params.chatId,
                    await readJsonBody(request),
                );
                const chats = await readChatSummaryCollection();

                return json({ ok: true, chat, chats });
            }),

            DELETE: api(async (request) => {
                const result = await deleteChatById(request.params.chatId);
                return result
                    ? json({ ok: true, ...result })
                    : json({ error: "Chat not found." }, 404);
            }),
        },

        "/api/personas": {
            GET: api(async () => {
                return json(await readPersonaSummaryCollection());
            }),

            POST: api(async (request) => {
                const result = await createPersona(await readJsonBody(request));
                return json({ ok: true, ...result });
            }),
        },

        "/api/personas/index": {
            PUT: api(async (request) => {
                const index = await updatePersonaIndex(await readJsonBody(request));
                const personas = await readPersonaSummaryCollection();

                return json({ ok: true, index, personas });
            }),
        },

        "/api/personas/assets/:file": {
            GET: api(async (request) => {
                return servePersonaAsset(new URL(request.url));
            }),
        },

        "/api/personas/:personaId/avatar": {
            POST: api(async (request, routeServer) => {
                routeServer.timeout(request, 60);
                const result = await writePersonaAvatar(
                    request.params.personaId,
                    request,
                );

                return json({ ok: true, ...result });
            }),
        },

        "/api/personas/:personaId": {
            GET: api(async (request) => {
                const persona = await readPersonaById(request.params.personaId);
                return persona
                    ? json(persona)
                    : json({ error: "Persona not found." }, 404);
            }),

            PUT: api(async (request) => {
                const persona = await writePersonaById(
                    request.params.personaId,
                    await readJsonBody(request),
                );
                const personas = await readPersonaSummaryCollection();

                return json({ ok: true, persona, personas });
            }),

            DELETE: api(async (request) => {
                const result = await deletePersonaById(request.params.personaId);
                return result
                    ? json({ ok: true, ...result })
                    : json({ error: "Persona not found." }, 404);
            }),
        },

        "/api/characters": {
            GET: api(async () => {
                return json(await readCharacterSummaryCollection());
            }),

            POST: api(async (request) => {
                const result = await createCharacter(await readJsonBody(request));
                return json({ ok: true, ...result });
            }),
        },

        "/api/characters/index": {
            PUT: api(async (request) => {
                const index = await updateCharacterIndex(await readJsonBody(request));
                const characters = await readCharacterSummaryCollection();

                return json({ ok: true, index, characters });
            }),
        },

        "/api/characters/import-dropped": {
            POST: api(async (request, routeServer) => {
                routeServer.timeout(request, 60);
                const result = await importDroppedCharacterFiles();

                return json(result);
            }),
        },

        "/api/characters/import": {
            POST: api(async (request, routeServer) => {
                routeServer.timeout(request, 60);
                const result = await importUploadedCharacterFiles(request);

                return json(result);
            }),
        },

        "/api/characters/:characterId/avatar": {
            GET: api(async (request) => {
                const character = await readCharacterById(request.params.characterId);
                return character
                    ? serveCharacterAvatar(character)
                    : json({ error: "Character not found." }, 404);
            }),

            POST: api(async (request, routeServer) => {
                routeServer.timeout(request, 60);
                const result = await writeCharacterAvatar(
                    request.params.characterId,
                    request,
                );

                return json({ ok: true, ...result });
            }),
        },

        "/api/characters/:characterId/export.json": {
            GET: api(async (request) => {
                return exportCharacterCard(request.params.characterId, "json");
            }),
        },

        "/api/characters/:characterId/export.png": {
            GET: api(async (request, routeServer) => {
                routeServer.timeout(request, 60);
                return exportCharacterCard(request.params.characterId, "png");
            }),
        },

        "/api/characters/:characterId": {
            GET: api(async (request) => {
                const character = await readCharacterById(request.params.characterId);
                return character
                    ? json(character)
                    : json({ error: "Character not found." }, 404);
            }),

            PUT: api(async (request) => {
                const character = await writeCharacterById(
                    request.params.characterId,
                    await readJsonBody(request),
                );
                const characters = await readCharacterSummaryCollection();
                const summary = characterToSummary(character);

                return json({ ok: true, character, summary, characters });
            }),

            DELETE: api(async (request) => {
                const url = new URL(request.url);
                const deleteChats = url.searchParams.get("deleteChats") === "true";
                const result = await deleteCharacterById(request.params.characterId);

                const chatDeleteResult =
                    result && deleteChats
                        ? await deleteChatsByCharacterId(request.params.characterId)
                        : undefined;

                if (result && deleteChats) {
                    const chats =
                        chatDeleteResult?.chats ?? (await readChatSummaryCollection());

                    return json({ ok: true, ...result, chats });
                }

                return result
                    ? json({ ok: true, ...result })
                    : json({ error: "Character not found." }, 404);
            }),
        },

        "/api/*": json({ error: "Not found." }, 404),
    },

    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/plugins/")) {
            return servePluginAsset(url);
        }

        return serveStatic(url);
    },
});

console.log(`SmileyChat running at ${server.url}`);

function api<Path extends string, WebSocketData = undefined>(
    handler: ApiHandler<Path, WebSocketData>,
) {
    return async (request: Bun.BunRequest<Path>, server: Bun.Server<WebSocketData>) => {
        try {
            await verifyCsrfRequest(request);
            return await handler(routeRequest(request), server);
        } catch (error) {
            return apiErrorResponse(error);
        }
    };
}

function routeRequest<Path extends string>(request: Bun.BunRequest<Path>) {
    Object.defineProperty(request, "params", {
        value: decodeRouteParams(request.params),
        configurable: true,
    });

    return request;
}

function decodeRouteParams<Path extends string>(params: Bun.BunRequest<Path>["params"]) {
    return Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, decodeRouteParam(value)]),
    );
}

function decodeRouteParam(value: unknown) {
    try {
        return decodeURIComponent(String(value));
    } catch {
        return value;
    }
}

function apiErrorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
            ? error.code
            : undefined;

    return json(
        code ? { error: message, code } : { error: message },
        statusForApiError(error),
    );
}

function statusForApiError(error: unknown) {
    if (error instanceof HttpError) {
        return error.status;
    }

    return 500;
}
