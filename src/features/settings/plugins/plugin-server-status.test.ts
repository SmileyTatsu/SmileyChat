import { describe, expect, test } from "bun:test";

import { pluginServerStatusLine } from "./plugin-settings-helpers";

describe("pluginServerStatusLine", () => {
    test("says nothing for a plugin without a server module", () => {
        expect(pluginServerStatusLine({}, [])).toBeUndefined();
        expect(
            pluginServerStatusLine({ serverMain: "   " }, ["server:process"]),
        ).toBeUndefined();
    });

    test("waits for approval while the grant is missing", () => {
        expect(pluginServerStatusLine({ serverMain: "server.ts" }, [])).toEqual({
            text: "Server part waiting for your approval",
            tone: "pending",
            detail: undefined,
        });
        expect(
            pluginServerStatusLine({ serverMain: "server.ts" }, ["connections:secrets"]),
        ).toMatchObject({ tone: "pending" });
    });

    test("reports the running state once approved", () => {
        expect(
            pluginServerStatusLine(
                { serverMain: "server.ts", serverStatus: { state: "running" } },
                ["server:process"],
            ),
        ).toEqual({ text: "Server part running", tone: "running", detail: undefined });
    });

    test("shows the server's own error text", () => {
        expect(
            pluginServerStatusLine(
                {
                    serverMain: "server.ts",
                    serverStatus: { state: "error", error: "Cannot find module sharp" },
                },
                ["server:process"],
            ),
        ).toEqual({
            text: "Cannot find module sharp",
            tone: "error",
            detail: undefined,
        });

        expect(
            pluginServerStatusLine(
                { serverMain: "server.ts", serverStatus: { state: "error" } },
                ["server:process"],
            ),
        ).toMatchObject({ text: "Server part failed to start", tone: "error" });
    });

    test("reports a stopped module instead of claiming it runs", () => {
        expect(
            pluginServerStatusLine(
                { serverMain: "server.ts", serverStatus: { state: "stopped" } },
                ["server:process"],
            ),
        ).toMatchObject({ text: "Server part stopped", tone: "stopped" });
    });

    test("adds the last request failure as secondary text only when present", () => {
        expect(
            pluginServerStatusLine(
                {
                    serverMain: "server.ts",
                    serverStatus: {
                        state: "running",
                        lastRequestError: "host request timed out",
                    },
                },
                ["server:process"],
            ),
        ).toEqual({
            text: "Server part running",
            tone: "running",
            detail: "Last request failed: host request timed out",
        });

        expect(
            pluginServerStatusLine(
                {
                    serverMain: "server.ts",
                    serverStatus: { state: "running", lastRequestError: "" },
                },
                ["server:process"],
            )?.detail,
        ).toBeUndefined();
    });

    test("uses the runtime state when only serverStatus is present", () => {
        expect(
            pluginServerStatusLine({ serverStatus: { state: "running" } }, []),
        ).toEqual({
            text: "Server part running",
            tone: "running",
            detail: undefined,
        });
        expect(
            pluginServerStatusLine({ serverStatus: { state: "stopped" } }, []),
        ).toMatchObject({ tone: "stopped" });
    });
});
