import { HttpError, json, parsePort, readJsonBody } from "./http";
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

type RouteRequest<Params extends Record<string, string> = Record<string, string>> =
    Request & {
        params: Params;
    };

type RouteServer = {
    timeout(request: Request, seconds: number): void;
};

type ApiHandler<Params extends Record<string, string> = Record<string, string>> = (
    request: RouteRequest<Params>,
    server: RouteServer,
) => Response | Promise<Response>;

const port = parsePort(process.env.SMILEYCHAT_PORT);

ensureUserData();
await importDroppedCharacterFiles();

const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    routes: {
        "/api/health": {
            GET: api(() => json({ ok: true, userDataDir })),
        },

        "/api/plugins": {
            GET: api(async () => json({ plugins: await readPluginManifests() })),
        },

        "/api/plugins/:pluginId": {
            PUT: api<{ pluginId: string }>(async (request) => {
                const body = await readJsonBody(request);
                const enabled =
                    body && typeof body === "object" && "enabled" in body
                        ? body.enabled
                        : undefined;

                return updatePluginEnabled(request.params.pluginId, enabled);
            }),
        },

        "/api/plugins/:pluginId/storage/:key": {
            GET: api<{ pluginId: string; key: string }>((request) =>
                readPluginStorage(request.params.pluginId, request.params.key),
            ),
            PUT: api<{ pluginId: string; key: string }>(async (request) =>
                writePluginStorage(
                    request.params.pluginId,
                    request.params.key,
                    await readJsonBody(request),
                ),
            ),
            DELETE: api<{ pluginId: string; key: string }>((request) =>
                deletePluginStorage(request.params.pluginId, request.params.key),
            ),
        },

        "/api/connections": {
            GET: api(async () => json(await readConnectionSettings())),
            PUT: api(async (request) => {
                const settings = await writeConnectionSettings(await readJsonBody(request));
                return json({ ok: true, settings });
            }),
        },

        "/api/connections/secrets": {
            GET: api(async () => json(await readConnectionSecrets())),
            PUT: api(async (request) => {
                const secrets = await writeConnectionSecrets(await readJsonBody(request));
                return json({ ok: true, secrets });
            }),
        },

        "/api/presets": {
            GET: api(async () => json(await readPresetCollection())),
            PUT: api(async (request) => {
                const presets = await writePresetCollection(await readJsonBody(request));
                return json({ ok: true, presets });
            }),
        },

        "/api/preferences": {
            GET: api(async () => json(await readAppPreferences())),
            PUT: api(async (request) => {
                const preferences = await writeAppPreferences(await readJsonBody(request));
                return json({ ok: true, preferences });
            }),
        },

        "/api/chats": {
            GET: api(async () => json(await readChatSummaryCollection())),
            POST: api(async (request) => {
                const result = await createChat(await readJsonBody(request));
                return json({ ok: true, ...result });
            }),
        },

        "/api/chats/index": {
            PUT: api(async (request) => {
                const index = await updateChatIndex(await readJsonBody(request));
                return json({ ok: true, index, chats: await readChatSummaryCollection() });
            }),
        },

        "/api/chats/:chatId": {
            GET: api<{ chatId: string }>(async (request) => {
                const chat = await readChatById(request.params.chatId);
                return chat ? json(chat) : json({ error: "Chat not found." }, 404);
            }),
            PUT: api<{ chatId: string }>(async (request) => {
                const chat = await writeChatById(
                    request.params.chatId,
                    await readJsonBody(request),
                );
                return json({
                    ok: true,
                    chat,
                    chats: await readChatSummaryCollection(),
                });
            }),
            DELETE: api<{ chatId: string }>(async (request) => {
                const result = await deleteChatById(request.params.chatId);
                return result
                    ? json({ ok: true, ...result })
                    : json({ error: "Chat not found." }, 404);
            }),
        },

        "/api/personas": {
            GET: api(async () => json(await readPersonaSummaryCollection())),
            POST: api(async (request) => {
                const result = await createPersona(await readJsonBody(request));
                return json({ ok: true, ...result });
            }),
        },

        "/api/personas/index": {
            PUT: api(async (request) => {
                const index = await updatePersonaIndex(await readJsonBody(request));
                return json({
                    ok: true,
                    index,
                    personas: await readPersonaSummaryCollection(),
                });
            }),
        },

        "/api/personas/assets/:file": {
            GET: api((request) => servePersonaAsset(new URL(request.url))),
        },

        "/api/personas/:personaId/avatar": {
            POST: api<{ personaId: string }>((request, routeServer) => {
                routeServer.timeout(request, 60);
                return writePersonaAvatar(request.params.personaId, request).then(
                    (result) => json({ ok: true, ...result }),
                );
            }),
        },

        "/api/personas/:personaId": {
            GET: api<{ personaId: string }>(async (request) => {
                const persona = await readPersonaById(request.params.personaId);
                return persona
                    ? json(persona)
                    : json({ error: "Persona not found." }, 404);
            }),
            PUT: api<{ personaId: string }>(async (request) => {
                const persona = await writePersonaById(
                    request.params.personaId,
                    await readJsonBody(request),
                );
                return json({
                    ok: true,
                    persona,
                    personas: await readPersonaSummaryCollection(),
                });
            }),
            DELETE: api<{ personaId: string }>(async (request) => {
                const result = await deletePersonaById(request.params.personaId);
                return result
                    ? json({ ok: true, ...result })
                    : json({ error: "Persona not found." }, 404);
            }),
        },

        "/api/characters": {
            GET: api(async () => json(await readCharacterSummaryCollection())),
            POST: api(async (request) => {
                const result = await createCharacter(await readJsonBody(request));
                return json({ ok: true, ...result });
            }),
        },

        "/api/characters/index": {
            PUT: api(async (request) => {
                const index = await updateCharacterIndex(await readJsonBody(request));
                return json({
                    ok: true,
                    index,
                    characters: await readCharacterSummaryCollection(),
                });
            }),
        },

        "/api/characters/import-dropped": {
            POST: api((request, routeServer) => {
                routeServer.timeout(request, 60);
                return importDroppedCharacterFiles().then((result) => json(result));
            }),
        },

        "/api/characters/import": {
            POST: api((request, routeServer) => {
                routeServer.timeout(request, 60);
                return importUploadedCharacterFiles(request).then((result) =>
                    json(result),
                );
            }),
        },

        "/api/characters/:characterId/avatar": {
            GET: api<{ characterId: string }>(async (request) => {
                const character = await readCharacterById(request.params.characterId);
                return character
                    ? serveCharacterAvatar(character)
                    : json({ error: "Character not found." }, 404);
            }),
            POST: api<{ characterId: string }>((request, routeServer) => {
                routeServer.timeout(request, 60);
                return writeCharacterAvatar(request.params.characterId, request).then(
                    (result) => json({ ok: true, ...result }),
                );
            }),
        },

        "/api/characters/:characterId/export.json": {
            GET: api<{ characterId: string }>((request) =>
                exportCharacterCard(request.params.characterId, "json"),
            ),
        },

        "/api/characters/:characterId/export.png": {
            GET: api<{ characterId: string }>((request, routeServer) => {
                routeServer.timeout(request, 60);
                return exportCharacterCard(request.params.characterId, "png");
            }),
        },

        "/api/characters/:characterId": {
            GET: api<{ characterId: string }>(async (request) => {
                const character = await readCharacterById(request.params.characterId);
                return character
                    ? json(character)
                    : json({ error: "Character not found." }, 404);
            }),
            PUT: api<{ characterId: string }>(async (request) => {
                const character = await writeCharacterById(
                    request.params.characterId,
                    await readJsonBody(request),
                );
                return json({
                    ok: true,
                    character,
                    summary: characterToSummary(character),
                    characters: await readCharacterSummaryCollection(),
                });
            }),
            DELETE: api<{ characterId: string }>(async (request) => {
                const url = new URL(request.url);
                const deleteChats = url.searchParams.get("deleteChats") === "true";
                const result = await deleteCharacterById(request.params.characterId);

                const chatDeleteResult =
                    result && deleteChats
                        ? await deleteChatsByCharacterId(request.params.characterId)
                        : undefined;

                if (result && deleteChats) {
                    return json({
                        ok: true,
                        ...result,
                        chats:
                            chatDeleteResult?.chats ??
                            (await readChatSummaryCollection()),
                    });
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

function api<Params extends Record<string, string> = Record<string, string>>(
    handler: ApiHandler<Params>,
) {
    return async (request: Request, routeServer: RouteServer) => {
        try {
            return await handler(routeRequest(request), routeServer);
        } catch (error) {
            return apiErrorResponse(error);
        }
    };
}

function routeRequest<Params extends Record<string, string> = Record<string, string>>(
    request: Request,
) {
    const params = decodeRouteParams(
        (request as Request & { params?: Record<string, string> }).params,
    ) as Params;

    return new Proxy(request, {
        get(target, property, receiver) {
            if (property === "params") {
                return params;
            }

            const value = Reflect.get(target, property, receiver);

            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as RouteRequest<Params>;
}

function decodeRouteParams(params: Record<string, string> = {}) {
    return Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, decodeRouteParam(value)]),
    );
}

function decodeRouteParam(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function apiErrorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";

    return json({ error: message }, statusForApiError(error));
}

function statusForApiError(error: unknown) {
    if (error instanceof HttpError) {
        return error.status;
    }

    return 500;
}
