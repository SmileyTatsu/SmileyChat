import { afterEach, describe, expect, test } from "bun:test";

import {
    createPluginApi,
    getPluginConnectionProviderOwnerId,
    getPluginMacroValue,
    setPluginEnabledState,
    setPluginSnapshot,
    subscribeToPluginRegistry,
} from "./registry";
import type {
    PluginAppSnapshot,
    PluginManifest,
    PluginNetworkApi,
    PluginStorageApi,
} from "./types";

const originalWarn = console.warn;
let idCounter = 0;

afterEach(() => {
    console.warn = originalWarn;
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
