import { afterEach, describe, expect, test } from "bun:test";

import { createBlankCharacter } from "../characters/normalize";
import {
    applyMessageDisplayMiddlewares,
    closePluginModal,
    createPluginApi,
    deactivatePlugin,
    getInputMiddlewares,
    getMessageUpdateMiddlewares,
    getOutputMiddlewares,
    getPluginCharacterDetailsSections,
    getPluginConnectionProviderOwnerId,
    getRegisteredPluginTools,
    getPluginMacroValue,
    getPluginModalInstances,
    getPluginSettingsDefinition,
    getPluginSettingsPanels,
    getPendingPluginConfirms,
    getPluginSettingsRecord,
    resolvePluginConfirm,
    getPluginSettingsValue,
    setPluginModelHandlers,
    setPluginPresetHandlers,
    setPluginAppActionHandlers,
    setPluginConnectionAccessHandlers,
    setPluginEnabledState,
    setPluginSnapshot,
    subscribeToPluginRegistry,
} from "./registry";
import type {
    PluginAppSnapshot,
    PluginManifest,
    ChatInputMiddleware,
    MessageUpdateMiddleware,
    PluginNetworkApi,
    PluginStorageApi,
} from "./types";

const originalWarn = console.warn;
const originalFetch = globalThis.fetch;
let mockedRequests: Array<{ url: string; init?: RequestInit }> = [];
let idCounter = 0;

afterEach(() => {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
    mockedRequests = [];
    setPluginModelHandlers({});
    setPluginConnectionAccessHandlers({});
});

describe("plugin registry runtime isolation", () => {
    test("snapshot listener errors do not block later listeners", () => {
        console.warn = () => {};
        const throwingApi = pluginApi(uniqueId("snapshot-throwing"), ["state:read"]);
        const receivingApi = pluginApi(uniqueId("snapshot-receiving"), ["state:read"]);
        const unsubscribeThrowing = throwingApi.state.subscribe(() => {
            throw new Error("snapshot listener failed");
        });
        let receivedSnapshots = 0;
        const unsubscribeReceiving = receivingApi.state.subscribe(() => {
            receivedSnapshots += 1;
        });

        receivedSnapshots = 0;
        setPluginSnapshot({} as PluginAppSnapshot);

        expect(receivedSnapshots).toBe(1);

        unsubscribeThrowing();
        unsubscribeReceiving();
    });

    test("event listener errors do not block later listeners", () => {
        console.warn = () => {};
        const eventName = uniqueId("event");
        const throwingApi = pluginApi(uniqueId("event-throwing"), ["events"]);
        const receivingApi = pluginApi(uniqueId("event-receiving"), ["events"]);
        const unsubscribeThrowing = throwingApi.events.on(eventName, () => {
            throw new Error("event listener failed");
        });
        let receivedEvents = 0;
        const unsubscribeReceiving = receivingApi.events.on(eventName, () => {
            receivedEvents += 1;
        });

        throwingApi.events.emit(eventName, { ok: true });

        expect(receivedEvents).toBe(1);

        unsubscribeThrowing();
        unsubscribeReceiving();
    });

    test("registry listener errors do not block later listeners", () => {
        console.warn = () => {};
        const unsubscribeThrowing = subscribeToPluginRegistry(() => {
            throw new Error("registry listener failed");
        });
        let receivedChanges = 0;
        const unsubscribeReceiving = subscribeToPluginRegistry(() => {
            receivedChanges += 1;
        });

        setPluginEnabledState(uniqueId("plugin"), true);

        expect(receivedChanges).toBe(1);

        unsubscribeThrowing();
        unsubscribeReceiving();
    });

    test("macro resolver errors do not escape prompt macro lookup", () => {
        console.warn = () => {};
        const macroName = uniqueId("macro");
        const api = pluginApi(uniqueId("macro-plugin"), ["presets:macros"]);

        api.presets.registerMacro(macroName, () => {
            throw new Error("macro resolver failed");
        });

        expect(getPluginMacroValue(macroName, {} as never)).toBeUndefined();
    });

    test("duplicate macro names keep the first plugin owner", () => {
        const warnings: unknown[][] = [];
        console.warn = (...args) => warnings.push(args);
        const macroName = uniqueId("duplicate-macro");
        const firstApi = pluginApi(uniqueId("macro-first"), ["presets:macros"]);
        const secondApi = pluginApi(uniqueId("macro-second"), ["presets:macros"]);

        firstApi.presets.registerMacro(macroName, () => "first");
        secondApi.presets.registerMacro(macroName, () => "second");

        expect(getPluginMacroValue(macroName, {} as never)).toBe("first");
        expect(String(warnings[0]?.[0])).toContain("duplicate plugin key");
    });

    test("duplicate connection provider IDs keep the first plugin owner", () => {
        const warnings: unknown[][] = [];
        console.warn = (...args) => warnings.push(args);
        const providerId = uniqueId("duplicate-provider");
        const firstPluginId = uniqueId("provider-first");
        const firstApi = pluginApi(firstPluginId, ["connections:providers"]);
        const secondApi = pluginApi(uniqueId("provider-second"), [
            "connections:providers",
        ]);
        const provider = {
            id: providerId,
            label: providerId,
            createAdapter() {
                throw new Error("unused");
            },
        };

        firstApi.connections.registerProvider(provider);
        secondApi.connections.registerProvider(provider);

        expect(getPluginConnectionProviderOwnerId(providerId)).toBe(firstPluginId);
        expect(String(warnings[0]?.[0])).toContain("duplicate plugin key");
    });

    test("connection secrets need a core capability or an explicit user approval", () => {
        const storedProfile = {
            id: "novelai-profile",
            name: "NovelAI Images",
            provider: "novelai",
            config: { apiKey: "secret-token" },
        } as never;
        setPluginConnectionAccessHandlers({
            getProfile: (profileId) =>
                profileId === "novelai-profile" ? storedProfile : undefined,
        });

        const coreManifest = pluginManifest("core-image", ["connections:secrets"]);
        coreManifest.source = "core";
        const coreApi = createPluginApi(
            coreManifest,
            storage,
            (() => null) as never,
            network,
            { coreConnectionSecrets: true },
        );
        const returnedProfile =
            coreApi.connections.getProfileWithSecrets("novelai-profile");

        expect(coreApi.connections.hasApiKey("novelai-profile")).toBe(true);
        expect(returnedProfile).toEqual(storedProfile);
        expect(returnedProfile).not.toBe(storedProfile);

        // A user plugin can declare the permission and still be refused: what
        // grants access is the user's runtime approval, not the manifest.
        const userApi = pluginApi("user-image", ["connections:secrets"]);
        expect(() => userApi.connections.hasApiKey("novelai-profile")).toThrow(
            "needs your approval",
        );

        const approvedApi = createPluginApi(
            pluginManifest("user-image-approved", ["connections:secrets"]),
            storage,
            (() => null) as never,
            network,
            { grantedPermissions: ["connections:secrets"] },
        );
        expect(approvedApi.connections.hasApiKey("novelai-profile")).toBe(true);

        // The approval is per permission: anything else stays closed.
        const unrelatedApi = createPluginApi(
            pluginManifest("user-image-other-grant", ["connections:secrets"]),
            storage,
            (() => null) as never,
            network,
            { grantedPermissions: ["ui:settings"] },
        );
        expect(() => unrelatedApi.connections.hasApiKey("novelai-profile")).toThrow(
            "needs your approval",
        );
    });

    test("output middleware registrations run by descending priority", async () => {
        const api = pluginApi(uniqueId("output-priority"), ["chat:output"]);
        const order: string[] = [];

        api.chat.registerOutputMiddleware({
            id: "low",
            priority: 99_999,
            run: (content) => {
                order.push("low");
                return content;
            },
        });
        api.chat.registerOutputMiddleware({
            id: "high",
            priority: 100_000,
            run: (content) => {
                order.push("high");
                return content;
            },
        });

        for (const middleware of getOutputMiddlewares()) {
            await middleware("", {} as never);
        }

        expect(order).toEqual(["high", "low"]);
    });

    test("message update middleware is enabled only while its plugin is enabled", () => {
        const pluginId = uniqueId("message-update");
        const api = pluginApi(pluginId, ["chat:message-update"]);
        const middleware: MessageUpdateMiddleware = (message) => message;

        api.chat.registerMessageUpdateMiddleware(middleware);
        expect(getMessageUpdateMiddlewares()).toContain(middleware);

        setPluginEnabledState(pluginId, false);
        expect(getMessageUpdateMiddlewares()).not.toContain(middleware);
    });

    test("function middleware registration replaces a plugin's prior registration", () => {
        const pluginId = uniqueId("input-middleware");
        const api = pluginApi(pluginId, ["chat:input"]);
        const first: ChatInputMiddleware = (content) => content;
        const second: ChatInputMiddleware = (content) => `${content}!`;

        api.chat.registerInputMiddleware(first);
        api.chat.registerInputMiddleware(second);

        const registered = getInputMiddlewares().filter(
            (middleware) => middleware === first || middleware === second,
        );
        expect(registered).toEqual([second]);
    });

    test("tool discovery preserves plugin-owned group metadata before availability filtering", () => {
        const pluginId = uniqueId("tool-group");
        const api = pluginApi(pluginId, ["tools:register"]);

        const dispose = api.tools.registerTool({
            name: uniqueId("tool"),
            description: "A test tool.",
            parameters: { type: "object" },
            toolGroup: { id: "server-a", label: "Server A", category: "mcp" },
            isAvailable: () => false,
            run: () => "unused",
        });
        const tool = getRegisteredPluginTools({} as PluginAppSnapshot).find(
            (entry) => entry.pluginId === pluginId,
        );

        expect(tool).toEqual(
            expect.objectContaining({
                groupId: `${pluginId}:server-a`,
                groupLabel: "Server A",
                category: "mcp",
                isAvailable: false,
            }),
        );

        dispose();
    });

    test("a tool whose availability check throws is unavailable instead of breaking discovery", () => {
        console.warn = () => {};
        const pluginId = uniqueId("tool-throws");
        const api = pluginApi(pluginId, ["tools:register"]);

        const dispose = api.tools.registerTool({
            name: uniqueId("tool"),
            description: "A test tool.",
            parameters: { type: "object" },
            isAvailable: () => {
                throw new Error("needs approval");
            },
            run: () => "unused",
        });
        const tool = getRegisteredPluginTools({} as PluginAppSnapshot).find(
            (entry) => entry.pluginId === pluginId,
        );

        expect(tool?.isAvailable).toBe(false);

        dispose();
    });

    test("display middleware failures preserve the original message text", () => {
        console.warn = () => {};
        const api = pluginApi(uniqueId("message-display"), ["chat:display"]);
        api.ui.registerMessageDisplayMiddleware(() => {
            throw new Error("display transform failed");
        });

        expect(applyMessageDisplayMiddlewares("Saved chat text", {} as never)).toBe(
            "Saved chat text",
        );
    });

    test("modal onClose runs when a plugin modal is closed", () => {
        const api = pluginApi(uniqueId("modal-close"), ["ui:modals"]);
        let closeCount = 0;

        api.ui.openModal({
            id: "review",
            onClose: () => {
                closeCount += 1;
            },
            render: () => null,
        });

        const modals = getPluginModalInstances();
        const modal = modals[modals.length - 1];

        expect(modal).toBeDefined();

        closePluginModal(modal?.id ?? "");

        expect(closeCount).toBe(1);
    });

    test("character detail sections require their dedicated permission and hide when disabled", () => {
        const pluginId = uniqueId("character-details");
        const api = pluginApi(pluginId, ["ui:character-details"]);

        api.ui.registerCharacterDetailsSection({
            id: "appearance",
            label: "Appearance",
            render: () => null,
        });

        expect(getPluginCharacterDetailsSections()).toContainEqual(
            expect.objectContaining({
                id: `${pluginId}:appearance`,
                label: "Appearance",
            }),
        );

        setPluginEnabledState(pluginId, false);

        expect(getPluginCharacterDetailsSections()).not.toContainEqual(
            expect.objectContaining({ id: `${pluginId}:appearance` }),
        );
    });

    test("character detail sections reject plugins without permission", () => {
        const api = pluginApi(uniqueId("character-details-denied"), []);

        expect(() =>
            api.ui.registerCharacterDetailsSection({
                id: "appearance",
                label: "Appearance",
                render: () => null,
            }),
        ).toThrow('needs "ui:character-details" permission');
    });

    test("preset macro resolution delegates to app handler", () => {
        const api = pluginApi(uniqueId("macro-resolve"), ["presets:macros"]);

        setPluginPresetHandlers({
            resolveMacros: (text) => text.replace("{{char}}", "Luna"),
        });

        expect(api.presets.resolveMacros("Hi {{char}}")).toBe("Hi Luna");

        setPluginPresetHandlers({});
    });

    test("message helpers report the active swipe", () => {
        const api = pluginApi(uniqueId("message-helper"), []);

        const message = {
            id: "message-1",
            role: "assistant",
            activeSwipeIndex: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            swipes: [
                { id: "swipe-1", content: "first draft" },
                { id: "swipe-2", content: "second draft" },
            ],
        } as never;

        expect(api.messages.content(message)).toBe("second draft");
        expect(api.messages.content({ swipes: [] } as never)).toBe("");
    });

    test("util helpers are the app's own implementations", () => {
        const api = pluginApi(uniqueId("util-helper"), []);

        expect(api.util.createId("thing")).toStartWith("thing-");
        expect(api.util.isAbortError(new DOMException("stop", "AbortError"))).toBe(true);
        expect(api.util.isAbortError(new Error("other"))).toBe(false);
    });

    test("confirm queues a host dialog and resolves with the answer", async () => {
        const api = pluginApi(uniqueId("confirm-plugin"), ["ui:modals"]);

        const first = api.ui.confirm({ title: "Delete?", message: "Sure?" });
        const second = api.ui.confirm({ title: "Second", message: "Later?" });

        const queued = getPendingPluginConfirms().filter(
            (item) => item.options.title === "Delete?" || item.options.title === "Second",
        );

        expect(queued).toHaveLength(2);
        expect(queued[0].options.title).toBe("Delete?");

        resolvePluginConfirm(queued[0].id, true);
        expect(await first).toBe(true);

        resolvePluginConfirm(queued[1].id, false);
        expect(await second).toBe(false);
        expect(getPendingPluginConfirms()).toHaveLength(0);
    });

    test("confirm requires the modals permission", () => {
        const api = pluginApi(uniqueId("confirm-no-permission"), []);

        expect(() => api.ui.confirm({ title: "Nope", message: "Nope" })).toThrow(
            'needs "ui:modals" permission',
        );
    });

    test("preset compilation needs its own permission", () => {
        const macroOnly = pluginApi(uniqueId("compile-no-permission"), [
            "presets:macros",
        ]);

        expect(() => macroOnly.presets.compileMessages(undefined, {} as never)).toThrow(
            'needs "presets:compile" permission',
        );
    });

    test("preset compilation returns the default prompt order for history", () => {
        const api = pluginApi(uniqueId("compile-ok"), ["presets:compile"]);
        const character = createBlankCharacter("Luna");
        const messages = [
            {
                id: "message-1",
                role: "user",
                createdAt: "2026-01-01T00:00:00.000Z",
                activeSwipeIndex: 0,
                swipes: [{ id: "swipe-1", content: "Hello there" }],
            },
        ] as never;

        const compiled = api.presets.compileMessages(undefined, {
            character,
            messages,
            mode: "chat",
            personaDescription: "",
            personaName: "Anon",
            userStatus: "online",
        });

        expect(compiled.length).toBeGreaterThan(0);
        expect(compiled[compiled.length - 1]?.content).toContain("Hello there");
    });

    test("model token estimate uses the shared generation message estimator", () => {
        const api = pluginApi(uniqueId("token-estimate"), ["model:generate"]);

        const tokens = api.model.estimateTokens([
            { role: "system", content: "Keep replies concise." },
            { role: "user", content: "Hello there." },
        ]);

        expect(tokens).toBeGreaterThan(0);
    });

    test("model context budget delegates to app handler", () => {
        const api = pluginApi(uniqueId("context-budget"), ["model:generate"]);

        setPluginModelHandlers({
            getContextBudget: (request) =>
                request?.profileId === "profile-large" ? 32000 : 16000,
        });

        expect(api.model.getContextBudget()).toBe(16000);
        expect(api.model.getContextBudget({ profileId: "profile-large" })).toBe(32000);
    });

    test("formats text-completion prompts with the shared instruct serializer", () => {
        const api = pluginApi(uniqueId("text-completion-formatting"), []);

        expect(
            api.formatting.formatTextCompletionPrompt(
                [{ role: "user", content: "Hello" }],
                { instructTemplate: "chatml" },
                "qwen-test",
            ),
        ).toBe("<|im_start|>user\nHello<|im_end|>\n<|im_start|>assistant\n");
        expect(
            api.formatting.formatTextCompletionPrompt(
                [{ role: "user", content: "Hello" }],
                { instructTemplate: "none" },
            ),
        ).toBe("Hello");
    });

    test("getLorebook action enforces permission and delegates to app handler", async () => {
        const unpermittedApi = pluginApi(uniqueId("actions-denied"), []);
        expect(() => unpermittedApi.actions.getLorebook("lorebook-1")).toThrow(
            'needs "actions" permission',
        );

        const permittedApi = pluginApi(uniqueId("actions-permitted"), ["actions"]);
        let requestedId = "";
        setPluginAppActionHandlers({
            getLorebook: async (id) => {
                requestedId = id;
                return { id, title: "Test Lorebook" } as never;
            },
        });

        const result = await permittedApi.actions.getLorebook("lorebook-123");
        expect(requestedId).toBe("lorebook-123");
        expect(result.title).toBe("Test Lorebook");

        setPluginAppActionHandlers({});
    });

    test("library reads delegate to app handlers and report when unavailable", async () => {
        const denied = pluginApi(uniqueId("reads-denied"), []);
        expect(() => denied.actions.listChats()).toThrow('needs "actions" permission');

        const api = pluginApi(uniqueId("reads-allowed"), ["actions"]);

        // Nothing wired yet: the message must say so instead of returning [].
        await expect(api.actions.listChats()).rejects.toThrow("not available");

        setPluginAppActionHandlers({
            listCharacters: async () => [{ id: "char-1", name: "Luna" }] as never,
            getCharacter: async (id) => ({ id, name: "Luna" }) as never,
            listPersonas: async () => [{ id: "persona-1", name: "Anon" }] as never,
            getPersona: async (id) => ({ id, name: "Anon" }) as never,
            listChats: async () => [{ id: "chat-1", defaultTitle: "First" }] as never,
            getChat: async (id) => ({ id, messages: [] }) as never,
        });

        expect((await api.actions.listCharacters())[0].id).toBe("char-1");
        expect((await api.actions.getCharacter("char-2")).id).toBe("char-2");
        expect((await api.actions.listPersonas())[0].id).toBe("persona-1");
        expect((await api.actions.getPersona("persona-2")).id).toBe("persona-2");
        expect((await api.actions.listChats())[0].id).toBe("chat-1");
        expect((await api.actions.getChat("chat-2")).id).toBe("chat-2");

        setPluginAppActionHandlers({});
    });

    test("settings register, get, set, normalize, and subscriptions work correctly", async () => {
        const id = uniqueId("settings-plugin");
        const api = pluginApi(id, []);

        type MySettings = { enabled: boolean; count: number; name: string };
        const defaults: MySettings = { enabled: false, count: 0, name: "test" };

        let subscribedValue: MySettings | undefined;
        const handle = await api.settings.register({
            defaultValues: defaults,
            normalize: (raw: any) => ({
                enabled: Boolean(raw?.enabled),
                count: typeof raw?.count === "number" ? Math.max(0, raw.count) : 0,
                name: typeof raw?.name === "string" ? raw.name.trim() : "default",
            }),
            validate: (val) => {
                if (val.count > 100) return "Count cannot exceed 100.";
            },
        });

        const unsubscribe = handle.subscribe((settings) => {
            subscribedValue = settings;
        });

        expect(handle.get()).toEqual(defaults);
        expect(api.settings.get<MySettings>()).toEqual(defaults);

        const updated = await handle.set({ count: 42, enabled: true });
        expect(updated).toEqual({ count: 42, enabled: true, name: "test" });
        expect(subscribedValue).toEqual({ count: 42, enabled: true, name: "test" });
        expect(handle.get()).toEqual({ count: 42, enabled: true, name: "test" });
        expect(getPluginSettingsValue<MySettings>(id)).toEqual({
            count: 42,
            enabled: true,
            name: "test",
        });

        // Validation rejection
        await expect(handle.set({ count: 101 })).rejects.toThrow(
            "Count cannot exceed 100.",
        );

        unsubscribe();
        deactivatePlugin(id);
        expect(getPluginSettingsRecord(id)).toBeUndefined();
    });

    test("settings registration initializes a record created by an early subscription", async () => {
        const id = uniqueId("subscribed-settings-plugin");
        const stored = { enabled: true, count: 7 };
        const customStorage: PluginStorageApi = {
            async getJson<T>() {
                return stored as T;
            },
            async setJson() {},
            async remove() {},
        };
        const api = createPluginApi(
            pluginManifest(id, []),
            customStorage,
            (() => null) as never,
            network,
        );

        const unsubscribe = api.settings.subscribe(() => undefined);
        const handle = await api.settings.register({
            defaultValues: { enabled: false, count: 0 },
        });

        expect(handle.get()).toEqual(stored);
        expect(getPluginSettingsValue<typeof stored>(id)).toEqual(stored);

        unsubscribe();
        deactivatePlugin(id);
    });

    test("concurrent settings patches are serialized without losing fields", async () => {
        const id = uniqueId("concurrent-settings-plugin");
        const writes: Array<{ enabled: boolean; count: number; name: string }> = [];
        const customStorage: PluginStorageApi = {
            async getJson(_key, fallback) {
                return fallback;
            },
            async setJson(_key, value) {
                await Promise.resolve();
                writes.push(value as (typeof writes)[number]);
            },
            async remove() {},
        };
        const api = createPluginApi(
            pluginManifest(id, []),
            customStorage,
            (() => null) as never,
            network,
        );
        const handle = await api.settings.register({
            defaultValues: { enabled: false, count: 0, name: "initial" },
        });

        await Promise.all([
            handle.set({ enabled: true, count: 1 }),
            handle.set({ name: "updated" }),
        ]);

        expect(handle.get()).toEqual({ enabled: true, count: 1, name: "updated" });
        expect(writes[writes.length - 1]).toEqual({
            enabled: true,
            count: 1,
            name: "updated",
        });
        deactivatePlugin(id);
    });

    test("settings panel registration preserves declarative fields and settingsKey", () => {
        const id = uniqueId("declarative-plugin");
        const api = pluginApi(id, ["ui:settings"]);

        api.ui.registerSettingsPanel({
            id: "panel-1",
            label: "Panel 1",
            settingsKey: "custom-settings",
            fields: [
                { type: "toggle", key: "active", label: "Active" },
                { type: "number", key: "limit", label: "Limit", min: 1, max: 50 },
            ],
        });

        const panel = getPluginSettingsPanels().find(
            (item) => item.id === `${id}:panel-1`,
        );
        expect(api.plugin.id).toBe(id);
        expect(panel?.settingsKey).toBe("custom-settings");
        expect(panel?.fields).toHaveLength(2);
        expect(getPluginSettingsDefinition(id, "custom-settings")).toBeUndefined();
        deactivatePlugin(id);
    });
});

describe("plugin host api", () => {
    test("host fetch requires the declared server:process permission", async () => {
        mockFetchServer(() => new Response("unreachable"));
        const api = pluginApi(uniqueId("host-undeclared"), []);

        await expect(api.host.fetch("/status")).rejects.toThrow(
            'needs "server:process" permission',
        );
        expect(mockedRequests).toHaveLength(0);
    });

    test("host fetch needs the user's approval even when declared", async () => {
        mockFetchServer(() => new Response("unreachable"));
        const api = pluginApi(uniqueId("host-ungranted"), ["server:process"]);

        await expect(api.host.fetch("/status")).rejects.toThrow(
            "needs your approval to run programs on your computer",
        );
        await expect(api.host.fetch("/status")).rejects.toThrow("Options > Plugins");
        expect(mockedRequests).toHaveLength(0);
    });

    test("core extensions can never reach a host module", async () => {
        mockFetchServer(() => new Response("unreachable"));
        const manifest = pluginManifest(uniqueId("host-core"), ["server:process"]);
        manifest.source = "core";
        const api = createPluginApi(manifest, storage, (() => null) as never, network, {
            grantedPermissions: ["server:process"],
        });

        await expect(api.host.fetch("/status")).rejects.toThrow(
            "core extension and cannot run a server module",
        );
        expect(mockedRequests).toHaveLength(0);
    });

    test("host fetch GET reaches the plugin host route and returns the response", async () => {
        const response = new Response("pong", { status: 200 });
        mockFetchServer(() => response);
        const pluginId = uniqueId("host-read");
        const api = hostApi(pluginId);

        const result = await api.host.fetch("/status?verbose=1");

        expect(result).toBe(response);
        expect(mockedRequests.map((request) => request.url)).toEqual([
            `/api/plugins/${pluginId}/host/status?verbose=1`,
        ]);
    });

    test("host fetch writes carry CSRF headers and the app's own credentials/mode", async () => {
        const response = new Response("saved", { status: 201 });
        mockFetchServer(() => response);
        const pluginId = uniqueId("host-write");
        const api = hostApi(pluginId);

        const result = await api.host.fetch("/items", {
            method: "POST",
            body: JSON.stringify({ name: "one" }),
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            mode: "no-cors",
        });

        expect(result).toBe(response);

        const request = mockedRequests.find((entry) => entry.url.includes("/host/"));
        expect(request?.url).toBe(`/api/plugins/${pluginId}/host/items`);
        expect(request?.init?.credentials).toBeUndefined();
        expect(request?.init?.mode).toBeUndefined();

        const headers = new Headers(request?.init?.headers);
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.get("x-smileychat-csrf")).toBeTruthy();
        expect(headers.get("x-smileychat-csrf-magic")).toBe("1");
    });

    test("host fetch rejects paths that could escape the plugin host route", async () => {
        mockFetchServer(() => new Response("unreachable"));
        const api = hostApi(uniqueId("host-bad-path"));
        const badPaths = [
            "",
            "status",
            "//evil.example/status",
            "http://evil.example/status",
            "/../settings",
            "/status/../../settings",
            "/./status",
            "/status/./nested",
            "\\status",
            "/status\\nested",
            "/status//nested",
            "/status\u0000",
            "/%2e%2e/settings",
            "/%2E%2E/settings",
            "/status/%2f..%2fsettings",
            "/%00status",
        ];

        for (const path of badPaths) {
            await expect(api.host.fetch(path)).rejects.toThrow(
                /Plugin host (path|fetch)/,
            );
        }

        expect(
            mockedRequests.filter((entry) => entry.url.includes("/host/")),
        ).toHaveLength(0);
    });
});

function pluginApi(id: string, permissions: string[]) {
    return createPluginApi(
        pluginManifest(id, permissions),
        storage,
        (() => null) as never,
        network,
    );
}

function hostApi(id: string, granted: string[] = ["server:process"]) {
    return createPluginApi(
        pluginManifest(id, ["server:process"]),
        storage,
        (() => null) as never,
        network,
        { grantedPermissions: granted },
    );
}

/**
 * `api.host` goes through `localApiFetch`, so these tests stand in for the Bun
 * server with a global fetch stub and record what the client asked for.
 */
function mockFetchServer(respond: (url: string) => Response) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        mockedRequests.push({ url, init });

        if (url.endsWith("/api/csrf")) {
            return new Response(JSON.stringify({ token: "test-csrf-token" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        return respond(url);
    }) as typeof fetch;
}

function pluginManifest(id: string, permissions: string[]): PluginManifest {
    return {
        id,
        main: "dist/index.js",
        name: id,
        permissions,
        version: "1.0.0",
    };
}

function uniqueId(prefix: string) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

const storage: PluginStorageApi = {
    async getJson(_key, fallback) {
        return fallback;
    },
    async setJson() {},
    async remove() {},
};

const network: PluginNetworkApi = {
    async fetch() {
        return new Response();
    },
};
