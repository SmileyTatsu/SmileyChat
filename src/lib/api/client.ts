import type {
    CharacterSummaryCollection,
    ChatAttachment,
    ChatSession,
    ChatSummaryCollection,
    PersonaSummaryCollection,
    SmileyCharacter,
    SmileyPersona,
} from "#frontend/types";

import type { ConnectionSecrets, ConnectionSettings } from "../connections/config";
import type { PluginProfile, PluginProfilesState } from "../plugins/profiles";
import type { PluginCategory, PluginManifest } from "../plugins/types";
import type { AppPreferences } from "../preferences/types";
import type { PresetCollection } from "../presets/types";
import type {
    Lorebook,
    LorebookCollection,
    LorebookImportResult,
} from "../lorebooks/types";

const csrfHeaderName = "x-smileychat-csrf";
const csrfMagicHeaderName = "x-smileychat-csrf-magic";
const csrfMagicValue = "1";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const defaultApiBasePath = "/api";

export const localApiErrorEventName = "smileychat:local-api-error";

let csrfToken: string | undefined;

export function localApiPath(path: string) {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    const basePath = normalizeApiBasePath(import.meta.env.VITE_SMILEYCHAT_API_BASE_PATH);
    const relativePath = path.startsWith(defaultApiBasePath)
        ? path.slice(defaultApiBasePath.length)
        : path;

    return `${basePath}${relativePath.startsWith("/") ? relativePath : `/${relativePath}`}`;
}

export async function localApiFetch(path: string, init: RequestInit = {}) {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const url = localApiPath(path);

    if (unsafeMethods.has(method)) {
        headers.set(csrfHeaderName, await getCsrfToken());
        headers.set(csrfMagicHeaderName, csrfMagicValue);
    }

    let response = await fetchLocalApi(url, method, path, init, headers);

    if (response.status === 403 && unsafeMethods.has(method)) {
        csrfToken = undefined;

        headers.set(csrfHeaderName, await getCsrfToken());
        headers.set(csrfMagicHeaderName, csrfMagicValue);
        response = await fetchLocalApi(url, method, path, init, headers);
    }

    if (response.status === 403 && unsafeMethods.has(method)) {
        void dispatchLocalApiError(response.clone());
    }

    return response;
}

function normalizeApiBasePath(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
        return defaultApiBasePath;
    }

    const trimmed = value.trim();

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/\/+$/, "");
    }

    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+$/, "") || defaultApiBasePath;
}

async function fetchLocalApi(
    url: string,
    method: string,
    originalPath: string,
    init: RequestInit,
    headers: Headers,
) {
    try {
        return await fetch(url, {
            ...init,
            headers,
        });
    } catch {
        throw new Error(
            `${method} ${originalPath} failed: local API request could not reach the server.`,
        );
    }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await localApiFetch(path, init);

    if (!response.ok) {
        throw new Error(
            `${init?.method ?? "GET"} ${path} failed: ${response.status}${await responseErrorSuffix(response)}`,
        );
    }

    return (await response.json()) as T;
}

async function getCsrfToken() {
    if (csrfToken) {
        return csrfToken;
    }

    let response: Response;

    try {
        response = await fetch(localApiPath("/api/csrf"));
    } catch {
        throw new Error(
            "Load CSRF token failed: local API request could not reach the server.",
        );
    }

    if (!response.ok) {
        throw new Error(
            `Load CSRF token failed: ${response.status}${await responseErrorSuffix(response)}`,
        );
    }

    const body = (await response.json()) as { token?: unknown };

    if (typeof body.token !== "string") {
        throw new Error("Load CSRF token failed: missing token.");
    }

    csrfToken = body.token;
    return csrfToken;
}

async function responseErrorSuffix(response: Response) {
    const message = await responseErrorMessage(response);
    return message ? ` - ${message}` : "";
}

async function responseErrorMessage(response: Response) {
    try {
        const text = await response.text();

        if (!text.trim()) {
            return "";
        }

        try {
            const body = JSON.parse(text) as unknown;

            if (
                body &&
                typeof body === "object" &&
                "code" in body &&
                typeof body.code === "string" &&
                "error" in body &&
                typeof body.error === "string"
            ) {
                return apiErrorMessage(body.code, body.error);
            }

            if (
                body &&
                typeof body === "object" &&
                "code" in body &&
                typeof body.code === "string" &&
                "message" in body &&
                typeof body.message === "string"
            ) {
                return apiErrorMessage(body.code, body.message);
            }

            if (
                body &&
                typeof body === "object" &&
                "error" in body &&
                typeof body.error === "string"
            ) {
                return body.error;
            }

            if (
                body &&
                typeof body === "object" &&
                "message" in body &&
                typeof body.message === "string"
            ) {
                return body.message;
            }
        } catch {
            return text.slice(0, 500);
        }

        return text.slice(0, 500);
    } catch {
        return "";
    }
}

function apiErrorMessage(code: string, message: string) {
    if (code === "csrf_origin_untrusted") {
        return `${message} Add this browser origin to 'SMILEYCHAT_TRUSTED_ORIGINS', if you are using a reverse proxy or LAN address.`;
    }

    if (code === "csrf_origin_missing") {
        return `${message} Check browser privacy extensions or proxy settings that remove request provenance headers.`;
    }

    return message;
}

async function dispatchLocalApiError(response: Response) {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(
        new CustomEvent(localApiErrorEventName, {
            detail: {
                message: await responseErrorMessage(response),
            },
        }),
    );
}

function jsonInit(method: "POST" | "PUT", body: unknown): RequestInit {
    return {
        method,
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    };
}

export function loadConnectionSettings() {
    return requestJson<ConnectionSettings>("/api/connections");
}

export function saveConnectionSettings(settings: ConnectionSettings) {
    return requestJson<{ ok: true; settings: ConnectionSettings }>(
        "/api/connections",
        jsonInit("PUT", settings),
    );
}

export function loadConnectionSecrets() {
    return requestJson<ConnectionSecrets>("/api/connections/secrets");
}

export function saveConnectionSecrets(secrets: ConnectionSecrets) {
    return requestJson<{ ok: true; secrets: ConnectionSecrets }>(
        "/api/connections/secrets",
        jsonInit("PUT", secrets),
    );
}

export function loadPresetCollection() {
    return requestJson<PresetCollection>("/api/presets");
}

export function loadAppPreferences() {
    return requestJson<AppPreferences>("/api/preferences");
}

export function saveAppPreferences(preferences: AppPreferences) {
    return requestJson<{ ok: true; preferences: AppPreferences }>(
        "/api/preferences",
        jsonInit("PUT", preferences),
    );
}

export function loadPluginManifests() {
    return requestJson<{ plugins: PluginManifest[] }>("/api/plugins");
}

export type PluginRegistryEntry = {
    id: string;
    name: string;
    description?: string;
    version: string;
    author?: string;
    category: PluginCategory;
    status: "official" | "verified";
    repository?: string;
    artifact: { url: string };
};

export type PluginRegistryPayload = {
    version: 1;
    plugins: PluginRegistryEntry[];
    allowManualArtifactInstall?: boolean;
};

export function loadPluginRegistry() {
    return requestJson<PluginRegistryPayload>("/api/plugins/registry");
}

export function installPlugin(pluginId: string) {
    return requestJson<{
        ok: true;
        plugin: PluginManifest;
        plugins: PluginManifest[];
    }>("/api/plugins/install", jsonInit("POST", { pluginId }));
}

export function installManualArtifact(artifactUrl: string) {
    return requestJson<{
        ok: true;
        plugin: PluginManifest;
        plugins: PluginManifest[];
    }>("/api/plugins/install", jsonInit("POST", { artifactUrl }));
}

export function updatePlugin(pluginId: string) {
    return requestJson<{
        ok: true;
        plugin: PluginManifest;
        plugins: PluginManifest[];
    }>(`/api/plugins/${encodeURIComponent(pluginId)}/update`, jsonInit("POST", {}));
}

export function savePluginEnabled(pluginId: string, enabled: boolean) {
    return requestJson<{
        ok: true;
        plugin?: PluginManifest;
        plugins?: PluginManifest[];
    }>(`/api/plugins/${encodeURIComponent(pluginId)}`, jsonInit("PUT", { enabled }));
}

export type PluginProfilesPayload = {
    activeProfileId: string;
    lastApplied: Record<string, boolean>;
    builtinProfiles: PluginProfile[];
    userProfiles: PluginProfile[];
};

export function loadPluginProfiles() {
    return requestJson<PluginProfilesPayload>("/api/plugins/profiles");
}

export function savePluginProfilesState(state: PluginProfilesState) {
    return requestJson<{ ok: true; state: PluginProfilesState }>(
        "/api/plugins/profiles",
        jsonInit("PUT", state),
    );
}

export function deletePluginProfile(profileId: string) {
    return requestJson<{ ok: true; state: PluginProfilesState }>(
        `/api/plugins/profiles/${encodeURIComponent(profileId)}`,
        { method: "DELETE" },
    );
}

export function loadPluginStorageSnapshot(pluginId: string) {
    return requestJson<{
        pluginId: string;
        storage: Record<string, unknown>;
    }>(`/api/plugins/${encodeURIComponent(pluginId)}/storage`);
}

export function savePluginStorageSnapshot(
    pluginId: string,
    storage: Record<string, unknown>,
) {
    return requestJson<{ ok: true }>(
        `/api/plugins/${encodeURIComponent(pluginId)}/storage`,
        jsonInit("PUT", { storage }),
    );
}

export function savePresetCollection(presets: PresetCollection) {
    return requestJson<{ ok: true; presets: PresetCollection }>(
        "/api/presets",
        jsonInit("PUT", presets),
    );
}

export function loadLorebookSummaries() {
    return requestJson<LorebookCollection>("/api/lorebooks");
}

export function loadLorebook(lorebookId: string) {
    return requestJson<Lorebook>(`/api/lorebooks/${encodeURIComponent(lorebookId)}`);
}

export function saveLorebook(lorebook: Lorebook) {
    return requestJson<{
        ok: true;
        lorebook: Lorebook;
        lorebooks?: LorebookCollection;
    }>(`/api/lorebooks/${encodeURIComponent(lorebook.id)}`, jsonInit("PUT", lorebook));
}

export function deleteLorebook(lorebookId: string) {
    return requestJson<{
        ok: true;
        lorebooks?: LorebookCollection;
    }>(`/api/lorebooks/${encodeURIComponent(lorebookId)}`, {
        method: "DELETE",
    });
}

export function importLorebookFiles(formData: FormData) {
    return requestJson<LorebookImportResult & { ok: true }>("/api/lorebooks/import", {
        method: "POST",
        body: formData,
    });
}

export async function exportLorebook(lorebookId: string, format: "json" | "smiley") {
    const suffix = format === "smiley" ? "export.smiley.json" : "export.json";
    const response = await localApiFetch(
        `/api/lorebooks/${encodeURIComponent(lorebookId)}/${suffix}`,
    );

    if (!response.ok) {
        throw new Error(
            `Export LoreBook failed: ${response.status}${await responseErrorSuffix(response)}`,
        );
    }

    return response;
}

export function loadChatSummaries() {
    return requestJson<ChatSummaryCollection>("/api/chats");
}

export function loadChat(chatId: string) {
    return requestJson<ChatSession>(`/api/chats/${encodeURIComponent(chatId)}`);
}

export function createChat(chat: ChatSession) {
    return requestJson<{
        ok: true;
        chat: ChatSession;
        chats?: ChatSummaryCollection;
    }>("/api/chats", jsonInit("POST", chat));
}

export function forkChat(chatId: string, messageId: string) {
    return requestJson<{
        ok: true;
        chat: ChatSession;
        chats?: ChatSummaryCollection;
    }>(`/api/chats/${encodeURIComponent(chatId)}/fork`, jsonInit("POST", { messageId }));
}

export function saveChat(chat: ChatSession) {
    return requestJson<{
        ok: true;
        chat: ChatSession;
        chats?: ChatSummaryCollection;
    }>(`/api/chats/${encodeURIComponent(chat.id)}`, jsonInit("PUT", chat));
}

export function deleteChat(chatId: string) {
    return requestJson<{
        ok: true;
        chats?: ChatSummaryCollection;
    }>(`/api/chats/${encodeURIComponent(chatId)}`, {
        method: "DELETE",
    });
}

export function importChatFile(formData: FormData) {
    return requestJson<{
        ok: true;
        chat: ChatSession;
        chats?: ChatSummaryCollection;
    }>("/api/chats/import", {
        method: "POST",
        body: formData,
    });
}

export function uploadChatAttachments(chatId: string, files: File[]) {
    const formData = new FormData();

    for (const file of files) {
        formData.append("files", file);
    }

    return requestJson<{
        ok: true;
        attachments: ChatAttachment[];
        url?: string;
    }>(`/api/chats/${encodeURIComponent(chatId)}/attachments`, {
        method: "POST",
        body: formData,
    });
}

export function deleteChatAttachment(chatId: string, fileName: string) {
    return requestJson<{ ok: true }>(
        `/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(fileName)}`,
        { method: "DELETE" },
    );
}

export function saveChatIndex(chats: ChatSummaryCollection) {
    return requestJson<{
        ok: true;
        chats?: ChatSummaryCollection;
    }>(
        "/api/chats/index",
        jsonInit("PUT", {
            activeChatIdsByCharacter: chats.activeChatIdsByCharacter,
            chatIds: chats.chats.map((chat) => chat.id),
        }),
    );
}

export function loadPersonaSummaries() {
    return requestJson<PersonaSummaryCollection>("/api/personas");
}

export function loadPersona(personaId: string) {
    return requestJson<SmileyPersona>(`/api/personas/${encodeURIComponent(personaId)}`);
}

export function createPersona(persona: SmileyPersona) {
    return requestJson<{
        ok: true;
        persona: SmileyPersona;
        personas?: PersonaSummaryCollection;
    }>("/api/personas", jsonInit("POST", persona));
}

export function savePersona(persona: SmileyPersona) {
    return requestJson<{
        ok: true;
        persona: SmileyPersona;
        personas?: PersonaSummaryCollection;
    }>(`/api/personas/${encodeURIComponent(persona.id)}`, jsonInit("PUT", persona));
}

export function uploadPersonaAvatar(personaId: string, file: File) {
    return requestJson<{
        ok: true;
        avatar?: SmileyPersona["avatar"];
        persona?: SmileyPersona;
        personas?: PersonaSummaryCollection;
    }>(`/api/personas/${encodeURIComponent(personaId)}/avatar`, {
        method: "POST",
        headers: {
            "Content-Type": file.type,
        },
        body: file,
    });
}

export function savePersonaIndex(personas: PersonaSummaryCollection) {
    return requestJson<{
        ok: true;
        personas?: PersonaSummaryCollection;
    }>(
        "/api/personas/index",
        jsonInit("PUT", {
            activePersonaId: personas.activePersonaId,
            personaIds: personas.personas.map((persona) => persona.id),
        }),
    );
}

export function deletePersona(personaId: string) {
    return requestJson<{
        ok: true;
        personas?: PersonaSummaryCollection;
    }>(`/api/personas/${encodeURIComponent(personaId)}`, {
        method: "DELETE",
    });
}

export function loadCharacterSummaries() {
    return requestJson<CharacterSummaryCollection>("/api/characters");
}

export function loadCharacter(characterId: string) {
    return requestJson<SmileyCharacter>(
        `/api/characters/${encodeURIComponent(characterId)}`,
    );
}

export function createCharacter(character: SmileyCharacter) {
    return requestJson<{
        ok: true;
        character: SmileyCharacter;
        characters?: CharacterSummaryCollection;
    }>("/api/characters", jsonInit("POST", character));
}

export function saveCharacter(character: SmileyCharacter) {
    return requestJson<{
        ok: true;
        character: SmileyCharacter;
        characters?: CharacterSummaryCollection;
    }>(`/api/characters/${encodeURIComponent(character.id)}`, jsonInit("PUT", character));
}

export function saveCharacterIndex(index: CharacterSummaryCollection) {
    return requestJson<{
        ok: true;
        characters?: CharacterSummaryCollection;
    }>(
        "/api/characters/index",
        jsonInit("PUT", {
            ...index,
            characterIds: index.characters.map((item) => item.id),
        }),
    );
}

export function deleteCharacter(
    characterId: string,
    options: { deleteChats?: boolean } = {},
) {
    const query = options.deleteChats ? "?deleteChats=true" : "";

    return requestJson<{
        ok: true;
        characters?: CharacterSummaryCollection;
        chats?: ChatSummaryCollection;
    }>(`/api/characters/${encodeURIComponent(characterId)}${query}`, {
        method: "DELETE",
    });
}

export function importCharacterFiles(formData: FormData) {
    return requestJson<{
        imported?: number;
        skipped?: number;
        activeCharacterId?: string;
        characters?: CharacterSummaryCollection;
        failed?: Array<{ fileName: string; error: string }>;
    }>("/api/characters/import", {
        method: "POST",
        body: formData,
    });
}

export function uploadCharacterAvatar(characterId: string, file: File) {
    return requestJson<{
        ok: true;
        avatar?: SmileyCharacter["avatar"];
        character?: SmileyCharacter;
        characters?: CharacterSummaryCollection;
    }>(`/api/characters/${encodeURIComponent(characterId)}/avatar`, {
        method: "POST",
        headers: {
            "Content-Type": file.type,
        },
        body: file,
    });
}

export async function exportCharacterCard(characterId: string, format: "json" | "png") {
    const response = await localApiFetch(
        `/api/characters/${encodeURIComponent(characterId)}/export.${format}`,
    );

    if (!response.ok) {
        throw new Error(
            `Export character failed: ${response.status}${await responseErrorSuffix(response)}`,
        );
    }

    return response;
}
