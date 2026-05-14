import { HttpError, json, parsePort, readJsonBody } from "./http";
import { userDataDir } from "./paths";
import { serveStatic } from "./static";
import { chatIdFromPath } from "./chat-file-paths";
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
    characterAvatarIdFromPath,
    characterExportFromPath,
    characterIdFromPath,
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
import { personaAvatarIdFromPath, personaIdFromPath } from "./persona-file-paths";
import { writePersonaAvatar } from "./persona-avatar";
import { servePersonaAsset } from "./persona-images";
import { ensureUserData } from "./user-data";
import {
    deletePluginStorage,
    pluginSettingsTargetFromPath,
    pluginStorageTargetFromPath,
    readPluginManifests,
    readPluginStorage,
    servePluginAsset,
    updatePluginEnabled,
    writePluginStorage,
} from "./plugins";

const port = parsePort(process.env.SMILEYCHAT_PORT);

ensureUserData();
await importDroppedCharacterFiles();

const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/api/")) {
            return handleApi(request, url);
        }

        if (url.pathname.startsWith("/plugins/")) {
            return servePluginAsset(url);
        }

        return serveStatic(url);
    },
});

console.log(`SmileyChat running at http://${server.hostname}:${server.port}`);

async function handleApi(request: Request, url: URL) {
    try {
        return (
            (await handleCoreApi(request, url)) ??
            (await handlePluginApi(request, url)) ??
            (await handleSettingsApi(request, url)) ??
            (await handleChatApi(request, url)) ??
            (await handlePersonaApi(request, url)) ??
            (await handleCharacterApi(request, url)) ??
            json({ error: "Not found." }, 404)
        );
    } catch (error) {
        return apiErrorResponse(error);
    }
}

async function handleCoreApi(request: Request, url: URL) {
    if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, userDataDir });
    }

    return undefined;
}

async function handlePluginApi(request: Request, url: URL) {
    if (request.method === "GET" && url.pathname === "/api/plugins") {
        return json({ plugins: await readPluginManifests() });
    }

    const pluginSettingsTarget = pluginSettingsTargetFromPath(url.pathname);

    if (pluginSettingsTarget && request.method === "PUT") {
        const body = await readJsonBody(request);
        const enabled =
            body && typeof body === "object" && "enabled" in body
                ? body.enabled
                : undefined;

        return updatePluginEnabled(pluginSettingsTarget.pluginId, enabled);
    }

    const pluginStorageTarget = pluginStorageTargetFromPath(url.pathname);

    if (!pluginStorageTarget) {
        return undefined;
    }

    if (request.method === "GET") {
        return readPluginStorage(pluginStorageTarget.pluginId, pluginStorageTarget.key);
    }

    if (request.method === "PUT") {
        return writePluginStorage(
            pluginStorageTarget.pluginId,
            pluginStorageTarget.key,
            await readJsonBody(request),
        );
    }

    if (request.method === "DELETE") {
        return deletePluginStorage(pluginStorageTarget.pluginId, pluginStorageTarget.key);
    }

    return undefined;
}

async function handleSettingsApi(request: Request, url: URL) {
    if (request.method === "GET" && url.pathname === "/api/connections") {
        return json(await readConnectionSettings());
    }

    if (request.method === "PUT" && url.pathname === "/api/connections") {
        const settings = await writeConnectionSettings(await readJsonBody(request));
        return json({ ok: true, settings });
    }

    if (request.method === "GET" && url.pathname === "/api/connections/secrets") {
        return json(await readConnectionSecrets());
    }

    if (request.method === "PUT" && url.pathname === "/api/connections/secrets") {
        const secrets = await writeConnectionSecrets(await readJsonBody(request));
        return json({ ok: true, secrets });
    }

    if (request.method === "GET" && url.pathname === "/api/presets") {
        return json(await readPresetCollection());
    }

    if (request.method === "PUT" && url.pathname === "/api/presets") {
        const presets = await writePresetCollection(await readJsonBody(request));
        return json({ ok: true, presets });
    }

    if (request.method === "GET" && url.pathname === "/api/preferences") {
        return json(await readAppPreferences());
    }

    if (request.method === "PUT" && url.pathname === "/api/preferences") {
        const preferences = await writeAppPreferences(await readJsonBody(request));
        return json({ ok: true, preferences });
    }

    return undefined;
}

async function handleChatApi(request: Request, url: URL) {
    if (request.method === "GET" && url.pathname === "/api/chats") {
        return json(await readChatSummaryCollection());
    }

    if (request.method === "POST" && url.pathname === "/api/chats") {
        const result = await createChat(await readJsonBody(request));
        return json({ ok: true, ...result });
    }

    if (request.method === "PUT" && url.pathname === "/api/chats/index") {
        const index = await updateChatIndex(await readJsonBody(request));
        return json({ ok: true, index, chats: await readChatSummaryCollection() });
    }

    const chatId = chatIdFromPath(url.pathname);

    if (!chatId) {
        return undefined;
    }

    if (request.method === "GET") {
        const chat = await readChatById(chatId);
        return chat ? json(chat) : json({ error: "Chat not found." }, 404);
    }

    if (request.method === "PUT") {
        const chat = await writeChatById(chatId, await readJsonBody(request));
        return json({
            ok: true,
            chat,
            chats: await readChatSummaryCollection(),
        });
    }

    if (request.method === "DELETE") {
        const result = await deleteChatById(chatId);
        return result
            ? json({ ok: true, ...result })
            : json({ error: "Chat not found." }, 404);
    }

    return undefined;
}

async function handlePersonaApi(request: Request, url: URL) {
    if (request.method === "GET" && url.pathname === "/api/personas") {
        return json(await readPersonaSummaryCollection());
    }

    if (request.method === "POST" && url.pathname === "/api/personas") {
        const result = await createPersona(await readJsonBody(request));
        return json({ ok: true, ...result });
    }

    if (request.method === "PUT" && url.pathname === "/api/personas/index") {
        const index = await updatePersonaIndex(await readJsonBody(request));
        return json({ ok: true, index, personas: await readPersonaSummaryCollection() });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/personas/assets/")) {
        return servePersonaAsset(url);
    }

    const avatarPersonaId = personaAvatarIdFromPath(url.pathname);

    if (avatarPersonaId && request.method === "POST") {
        const result = await writePersonaAvatar(avatarPersonaId, request);
        return json({ ok: true, ...result });
    }

    const personaId = personaIdFromPath(url.pathname);

    if (!personaId) {
        return undefined;
    }

    if (request.method === "GET") {
        const persona = await readPersonaById(personaId);
        return persona ? json(persona) : json({ error: "Persona not found." }, 404);
    }

    if (request.method === "PUT") {
        const persona = await writePersonaById(personaId, await readJsonBody(request));
        return json({
            ok: true,
            persona,
            personas: await readPersonaSummaryCollection(),
        });
    }

    if (request.method === "DELETE") {
        const result = await deletePersonaById(personaId);
        return result
            ? json({ ok: true, ...result })
            : json({ error: "Persona not found." }, 404);
    }

    return undefined;
}

async function handleCharacterApi(request: Request, url: URL) {
    if (request.method === "GET" && url.pathname === "/api/characters") {
        return json(await readCharacterSummaryCollection());
    }

    if (request.method === "POST" && url.pathname === "/api/characters") {
        const result = await createCharacter(await readJsonBody(request));
        return json({ ok: true, ...result });
    }

    if (request.method === "PUT" && url.pathname === "/api/characters/index") {
        const index = await updateCharacterIndex(await readJsonBody(request));
        return json({
            ok: true,
            index,
            characters: await readCharacterSummaryCollection(),
        });
    }

    if (request.method === "POST" && url.pathname === "/api/characters/import-dropped") {
        return json(await importDroppedCharacterFiles());
    }

    if (request.method === "POST" && url.pathname === "/api/characters/import") {
        return json(await importUploadedCharacterFiles(request));
    }

    const avatarCharacterId = characterAvatarIdFromPath(url.pathname);

    if (avatarCharacterId && request.method === "POST") {
        const result = await writeCharacterAvatar(avatarCharacterId, request);
        return json({ ok: true, ...result });
    }

    if (avatarCharacterId && request.method === "GET") {
        const character = await readCharacterById(avatarCharacterId);
        return character
            ? serveCharacterAvatar(character)
            : json({ error: "Character not found." }, 404);
    }

    const exportTarget = characterExportFromPath(url.pathname);

    if (exportTarget && request.method === "GET") {
        return exportCharacterCard(exportTarget.characterId, exportTarget.format);
    }

    const characterId = characterIdFromPath(url.pathname);

    if (!characterId) {
        return undefined;
    }

    if (request.method === "GET") {
        const character = await readCharacterById(characterId);
        return character ? json(character) : json({ error: "Character not found." }, 404);
    }

    if (request.method === "PUT") {
        const character = await writeCharacterById(
            characterId,
            await readJsonBody(request),
        );
        return json({
            ok: true,
            character,
            summary: characterToSummary(character),
            characters: await readCharacterSummaryCollection(),
        });
    }

    if (request.method === "DELETE") {
        const deleteChats = url.searchParams.get("deleteChats") === "true";
        const result = await deleteCharacterById(characterId);

        const chatDeleteResult =
            result && deleteChats ? await deleteChatsByCharacterId(characterId) : undefined;

        if (result && deleteChats) {
            return json({
                ok: true,
                ...result,
                chats: chatDeleteResult?.chats ?? (await readChatSummaryCollection()),
            });
        }

        return result
            ? json({ ok: true, ...result })
            : json({ error: "Character not found." }, 404);
    }

    return undefined;
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
