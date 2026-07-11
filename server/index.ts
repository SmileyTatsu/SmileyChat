import { execFileSync } from "node:child_process";
import { characterToSummary } from "#frontend/lib/characters/normalize";

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
import {
    deleteChatAsset,
    readUploadedChatAssets,
    serveChatAsset,
    writeChatAssets,
} from "./chat-assets";
import { exportGroupChatDefinition, importGroupChatDefinition } from "./chat-groups";
import { importUploadedChatFile } from "./chat-imports";
import {
    createChat,
    deleteChatById,
    deleteChatsByCharacterId,
    forkChatAtMessage,
    readChatById,
    readChatSummaryCollection,
    updateChatIndex,
    writeChatById,
} from "./chat-store";
import { ensureEnvFileExists, loadRuntimeEnv } from "./config/env-loader";
import { startEnvWatcher } from "./config/env-watcher";
import { getHost, getPort } from "./config/runtime-config";
import { createCsrfToken, verifyCsrfRequest } from "./csrf";
import { HttpError, json, readJsonBody } from "./http";
import {
    createLorebook,
    deleteLorebookById,
    exportLorebook,
    importUploadedLorebooks,
    lorebookNotFoundResponse,
    readLorebookById,
    readLorebookCollection,
    updateLorebookIndex,
    writeLorebookById,
} from "./lorebook-store";
import { userDataDir } from "./paths";
import { requirePrivilegedAccess } from "./security/privileged-gate";
import { writePersonaAvatar } from "./persona-avatar";
import { servePersonaAsset } from "./persona-images";
import {
    createPersona,
    deletePersonaById,
    readPersonaById,
    readPersonaSummaryCollection,
    updatePersonaIndex,
    writePersonaById,
} from "./persona-store";
import {
    deletePluginStorage,
    installVerifiedPlugin,
    proxyPluginFetch,
    readPluginManifests,
    readPluginRegistry,
    readPluginStorage,
    readPluginStorageSnapshot,
    servePluginAsset,
    updatePluginEnabled,
    updateInstalledPlugin,
    writePluginStorage,
    writePluginStorageSnapshot,
} from "./plugins";
import {
    deleteUserPluginProfile,
    readPluginProfiles,
    writePluginProfiles,
} from "./plugin-profiles";
import { finalize, runSecurityPipeline } from "./security/pipeline";
import {
    readAppPreferences,
    readConnectionSecrets,
    readConnectionSettings,
    readPresetCollection,
    writeAppPreferences,
    writeConnectionSecrets,
    writeConnectionSettings,
    writePresetCollection,
} from "./settings";
import { serveStatic } from "./static";
import { ensureUserData } from "./user-data";
import {
    callMcpTool,
    closeAll,
    connectMcpServer,
    disconnectMcpServer,
    autoConnectMcpServers,
    readMcpServers,
    refreshMcpServer,
    writeMcpServers,
} from "./mcp";

import type { SecurityContext } from "./security/pipeline";

type ApiHandler<Path extends string, WebSocketData = undefined> = (
    request: Bun.BunRequest<Path>,
    server: Bun.Server<WebSocketData>,
    context: SecurityContext,
) => Response | Promise<Response>;

ensureEnvFileExists();
loadRuntimeEnv();

const port = getPort();
const hostname = getHost();

ensureUserData();
await importDroppedCharacterFiles();

const envWatcher = startEnvWatcher();

let shuttingDown = false;
let server: Bun.Server<undefined> | undefined;

const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`Received ${signal}; shutting down SmileyChat.`);
    envWatcher.stop();
    server?.stop(true);
    try {
        await Promise.race([
            closeAll(),
            new Promise((resolve) => setTimeout(resolve, 4_500)),
        ]);
    } catch (error) {
        console.error("Error during shutdown:", error);
    }
    process.exit(0);
};

// Windows sends SIGHUP when its console closes and SIGBREAK for Ctrl+Break.
// SIGINT/SIGTERM still cover Ctrl+C and normal process termination.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
    process.once(signal, () => void shutdown(signal));
}

const createServer = () =>
    Bun.serve({
        hostname,
        port,
        routes: {
            "/api/health": {
                GET: api(async () => {
                    return json({ ok: true });
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

            "/api/mcp": {
                GET: api(async () => readMcpServers()),
                PUT: api(async (request) => writeMcpServers(await readJsonBody(request))),
            },
            "/api/mcp/:serverId/connect": {
                POST: api(async (request, routeServer) => {
                    routeServer.timeout(request, 120);
                    return connectMcpServer(request.params.serverId);
                }),
            },
            "/api/mcp/:serverId/disconnect": {
                POST: api(async (request) =>
                    disconnectMcpServer(request.params.serverId),
                ),
            },
            "/api/mcp/:serverId/refresh": {
                POST: api(async (request, routeServer) => {
                    routeServer.timeout(request, 120);
                    return refreshMcpServer(request.params.serverId);
                }),
            },
            "/api/mcp/:serverId/tools/:toolName": {
                POST: api(async (request) =>
                    callMcpTool(
                        request.params.serverId,
                        request.params.toolName,
                        await readJsonBody(request),
                    ),
                ),
            },

            "/api/plugins/registry": {
                GET: api(async () => {
                    return readPluginRegistry();
                }),
            },

            "/api/plugins/install": {
                POST: api(async (request) => {
                    return installVerifiedPlugin(await readJsonBody(request));
                }),
            },

            "/api/plugins/fetch": {
                POST: api(async (request) => {
                    return proxyPluginFetch(await readJsonBody(request));
                }),
            },

            "/api/plugins/profiles": {
                GET: api(async () => {
                    return readPluginProfiles();
                }),

                PUT: api(async (request) => {
                    return writePluginProfiles(await readJsonBody(request));
                }),
            },

            "/api/plugins/profiles/:profileId": {
                DELETE: api(async (request) => {
                    return deleteUserPluginProfile(request.params.profileId);
                }),
            },

            "/api/plugins/:pluginId/update": {
                POST: api(async (request) => {
                    return updateInstalledPlugin(request.params.pluginId);
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

            "/api/plugins/:pluginId/storage": {
                GET: api(async (request) => {
                    return readPluginStorageSnapshot(request.params.pluginId);
                }),

                PUT: api(async (request) => {
                    return writePluginStorageSnapshot(
                        request.params.pluginId,
                        await readJsonBody(request),
                    );
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
                    return deletePluginStorage(
                        request.params.pluginId,
                        request.params.key,
                    );
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
                GET: api(async (request, _server, context) => {
                    const rejection = requirePrivilegedAccess(request, context.ip, {
                        feature: "Connection secrets",
                    });
                    if (rejection) return rejection;

                    return json(await readConnectionSecrets());
                }),

                PUT: api(async (request, _server, context) => {
                    const rejection = requirePrivilegedAccess(request, context.ip, {
                        feature: "Connection secrets",
                    });
                    if (rejection) return rejection;

                    const secrets = await writeConnectionSecrets(
                        await readJsonBody(request),
                    );
                    return json({ ok: true, secrets });
                }),
            },

            "/api/presets": {
                GET: api(async () => {
                    return json(await readPresetCollection());
                }),

                PUT: api(async (request) => {
                    const presets = await writePresetCollection(
                        await readJsonBody(request),
                    );
                    return json({ ok: true, presets });
                }),
            },

            "/api/lorebooks": {
                GET: api(async () => {
                    return json(await readLorebookCollection());
                }),

                POST: api(async (request) => {
                    const result = await createLorebook(await readJsonBody(request));
                    return json({ ok: true, ...result });
                }),
            },

            "/api/lorebooks/index": {
                PUT: api(async (request) => {
                    const index = await updateLorebookIndex(await readJsonBody(request));
                    const lorebooks = await readLorebookCollection();

                    return json({ ok: true, index, lorebooks });
                }),
            },

            "/api/lorebooks/import": {
                POST: api(async (request, routeServer) => {
                    routeServer.timeout(request, 60);
                    const result = await importUploadedLorebooks(request);

                    return json({ ok: true, ...result });
                }),
            },

            "/api/lorebooks/:lorebookId/export.smiley.json": {
                GET: api(async (request) => {
                    return exportLorebook(request.params.lorebookId, "smiley");
                }),
            },

            "/api/lorebooks/:lorebookId/export.json": {
                GET: api(async (request) => {
                    return exportLorebook(request.params.lorebookId, "st");
                }),
            },

            "/api/lorebooks/:lorebookId": {
                GET: api(async (request) => {
                    const lorebook = await readLorebookById(request.params.lorebookId);
                    return lorebook ? json(lorebook) : lorebookNotFoundResponse();
                }),

                PUT: api(async (request) => {
                    const lorebook = await writeLorebookById(
                        request.params.lorebookId,
                        await readJsonBody(request),
                    );
                    const lorebooks = await readLorebookCollection();

                    return json({ ok: true, lorebook, lorebooks });
                }),

                DELETE: api(async (request) => {
                    const result = await deleteLorebookById(request.params.lorebookId);
                    return result
                        ? json({ ok: true, ...result })
                        : lorebookNotFoundResponse();
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

            "/api/chats/import": {
                POST: api(async (request, routeServer) => {
                    routeServer.timeout(request, 60);
                    const result = await importUploadedChatFile(request);

                    return json({ ok: true, ...result });
                }),
            },

            "/api/chats/import-group": {
                POST: api(async (request) => {
                    const result = await importGroupChatDefinition(
                        await readJsonBody(request),
                    );

                    return json({ ok: true, ...result });
                }),
            },

            "/api/chats/:chatId/attachments": {
                POST: api(async (request, routeServer) => {
                    routeServer.timeout(request, 60);
                    const files = await readUploadedChatAssets(request);
                    const attachments = await writeChatAssets(
                        request.params.chatId,
                        files,
                    );

                    return json({
                        ok: true,
                        attachments,
                        url: attachments[0]?.url,
                    });
                }),
            },

            "/api/chats/:chatId/attachments/:file": {
                GET: api(async (request) => {
                    return serveChatAsset(request.params.chatId, request.params.file);
                }),

                DELETE: api(async (request) => {
                    await deleteChatAsset(request.params.chatId, request.params.file);

                    return json({ ok: true });
                }),
            },

            "/api/chats/:chatId/export-group.json": {
                GET: api(async (request) => {
                    return exportGroupChatDefinition(request.params.chatId);
                }),
            },

            "/api/chats/:chatId/fork": {
                POST: api(async (request) => {
                    const result = await forkChatAtMessage(
                        request.params.chatId,
                        await readJsonBody(request),
                    );

                    return json({ ok: true, ...result });
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
                            chatDeleteResult?.chats ??
                            (await readChatSummaryCollection());

                        return json({ ok: true, ...result, chats });
                    }

                    return result
                        ? json({ ok: true, ...result })
                        : json({ error: "Character not found." }, 404);
                }),
            },

            "/api/*": json({ error: "Not found." }, 404),
        },

        async fetch(request, server) {
            const pipeline = runSecurityPipeline(request, server);
            if (pipeline instanceof Response) return pipeline;

            if (pipeline.url.pathname.startsWith("/plugins/")) {
                return finalize(
                    await servePluginAsset(pipeline.url),
                    pipeline.url,
                    pipeline.rateLimit,
                );
            }

            return finalize(
                await serveStatic(pipeline.url),
                pipeline.url,
                pipeline.rateLimit,
            );
        },
    });

// Connect MCP servers BEFORE the listening socket exists. On Windows, child
// processes spawned by stdio MCP servers (e.g. `npx …`) would otherwise inherit
// a duplicate handle to the port socket and keep the port bound after this
// process dies, causing EADDRINUSE on the next launch.
await autoConnectMcpServers();

// Safety net: if a previous run leaked an orphaned process still holding the
// port (e.g. a runtime MCP connection, or a hard console close), reclaim it so
// reopening never requires killing a process by hand.
reclaimPort(port);

server = await startServerWithRetry(createServer);

const listeningPort = server.port ?? port;

console.log(`Open ${getBrowserUrl(hostname, listeningPort)} in your browser.`);
console.log(`SmileyChat listening on ${formatListeningTarget(hostname, listeningPort)}.`);
if (hostname === "0.0.0.0" || hostname === "::") {
    console.log(
        `[server] Reachable from LAN, Tailscale, and Docker. Loopback (127.0.0.1) is always allowed; ` +
            `remote requests see the access-setup page until you set SMILEYCHAT_BASIC_AUTH_USER/PASS or ` +
            `SMILEYCHAT_IP_ALLOWLIST in .env (changes hot-reload, no restart).`,
    );
}

/**
 * Kill any process currently holding `targetPort` so startup can bind cleanly.
 * Windows-only; a no-op elsewhere. This targets orphaned children (typically a
 * leaked stdio MCP `node` process) that inherited the previous listening
 * socket handle and keep the port bound after the parent server exits.
 */
function reclaimPort(targetPort: number) {
    if (process.platform !== "win32") return;

    try {
        const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });

        const pids = new Set<string>();
        const suffix = `:${targetPort}`;
        for (const line of output.split(/\r?\n/)) {
            const parts = line.trim().split(/\s+/);
            // Columns: Proto  Local Address  Foreign Address  State  PID
            if (parts.length < 5 || parts[3] !== "LISTENING") continue;
            const localAddress = parts[1] ?? "";
            const pid = parts[4];
            if (!pid || pid === "0") continue;
            if (localAddress.endsWith(suffix)) pids.add(pid);
        }

        if (pids.has(String(process.pid))) pids.delete(String(process.pid));
        if (pids.size === 0) return;

        for (const pid of pids) {
            console.log(
                `Reclaiming port ${targetPort}: killing leftover process ${pid}.`,
            );
            try {
                execFileSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore" });
            } catch {
                // Process may already be gone; ignore.
            }
        }
    } catch {
        // netstat unavailable or failed; fall back to startServerWithRetry.
    }
}

async function startServerWithRetry<T>(create: () => T): Promise<T> {
    const retryDeadline = Date.now() + 8_000;
    let notified = false;

    while (true) {
        try {
            return create();
        } catch (error) {
            const code =
                error && typeof error === "object" && "code" in error
                    ? (error as { code?: unknown }).code
                    : undefined;

            if (code !== "EADDRINUSE" || Date.now() >= retryDeadline) throw error;

            if (!notified) {
                console.log(
                    `Port ${port} is still being released; waiting briefly to retry…`,
                );
                notified = true;
            }

            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
}

function api<Path extends string, WebSocketData = undefined>(
    handler: ApiHandler<Path, WebSocketData>,
) {
    return async (request: Bun.BunRequest<Path>, server: Bun.Server<WebSocketData>) => {
        const pipeline = runSecurityPipeline(request, server);
        if (pipeline instanceof Response) return pipeline;

        try {
            await verifyCsrfRequest(request, pipeline.trustedProxy);
            const response = await handler(routeRequest(request), server, pipeline);
            return finalize(response, pipeline.url, pipeline.rateLimit);
        } catch (error) {
            return finalize(apiErrorResponse(error), pipeline.url, pipeline.rateLimit);
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

function getBrowserUrl(host: string, port: number) {
    if (host === "0.0.0.0") {
        return `http://127.0.0.1:${port}`;
    }
    if (host === "::") {
        return `http://[::1]:${port}`;
    }

    return `http://${formatUrlHost(host)}:${port}`;
}

function formatHostPort(host: string, port: number) {
    return `${formatUrlHost(host)}:${port}`;
}

function formatListeningTarget(host: string, port: number) {
    if (host === "0.0.0.0") {
        return `all IPv4 interfaces, port ${port}`;
    }
    if (host === "::") {
        return `all IPv6 interfaces, port ${port}`;
    }

    return formatHostPort(host, port);
}

function formatUrlHost(host: string) {
    return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
