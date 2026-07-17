import { afterEach, describe, expect, test } from "bun:test";

import {
    applyMessageDisplayMiddlewares,
    closePluginModal,
    createPluginApi,
    getMessageUpdateMiddlewares,
    getOutputMiddlewares,
    getPluginCharacterDetailsSections,
    getPluginConnectionProviderOwnerId,
    getRegisteredPluginTools,
    getPluginMacroValue,
    getPluginModalInstances,
    setPluginModelHandlers,
    setPluginPresetHandlers,
    setPluginEnabledState,
    setPluginSnapshot,
    subscribeToPluginRegistry,
} from "./registry";
import type {
    PluginAppSnapshot,
    PluginManifest,
    MessageUpdateMiddleware,
    PluginNetworkApi,
    PluginStorageApi,
} from "./types";

const originalWarn = console.warn;
let idCounter = 0;

afterEach(() => {
    console.warn = originalWarn;
    setPluginModelHandlers({});
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
});

function pluginApi(id: string, permissions: string[]) {
    return createPluginApi(
        pluginManifest(id, permissions),
        storage,
        (() => null) as never,
        network,
    );
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
