import AdmZip from "adm-zip";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pluginHasGrant, writePluginPermissionGrant } from "./plugin-grants";
import {
    getPluginServerStatus,
    handlePluginServerRequest,
    stopAllPluginServers,
} from "./plugin-server-runtime";
import { syncPluginServers } from "./plugin-server-sync";
import { uninstallPlugin } from "./plugin-uninstall";
import {
    hostRequestIsCrossSite,
    pluginHostRequestSubpath,
    pluginInstallTestInternals,
    readPluginManifests,
} from "./plugins";

const roots: string[] = [];
let pluginCounter = 0;

afterEach(async () => {
    await stopAllPluginServers();

    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
});

function uniqueId(name: string) {
    pluginCounter += 1;
    return `${name}-${process.pid}-${pluginCounter}`;
}

async function tempRoot() {
    const root = await mkdtemp(join(tmpdir(), "smileychat-plugin-sync-"));
    roots.push(root);
    return root;
}

async function writeJson(path: string, value: unknown) {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify(value), "utf8");
}

async function exists(path: string) {
    return Boolean(await stat(path).catch(() => null));
}

async function readText(path: string) {
    return Bun.file(path)
        .text()
        .catch(() => "");
}

function isRunning(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitUntilDead(pid: number, timeoutMs = 5_000) {
    const deadline = Date.now() + timeoutMs;

    while (isRunning(pid) && Date.now() < deadline) {
        await Bun.sleep(25);
    }

    return !isRunning(pid);
}

type ServerPluginFixture = {
    pluginId: string;
    pluginRoot: string;
    markerPath: string;
    pidPath: string;
};

/**
 * A local plugin folder whose server module marks that it ran and spawns one
 * long-lived child, so both "did it load?" and "was it killed?" are observable
 * from outside the runtime.
 */
async function makeServerPlugin(
    root: string,
    folderName: string,
    options: {
        pluginId?: string;
        permissions?: string[];
        enabled?: boolean;
        body?: string;
        serverMain?: string;
        mainFile?: boolean;
    } = {},
): Promise<ServerPluginFixture> {
    const pluginId = options.pluginId ?? folderName;
    const pluginRoot = join(root, folderName);
    const markerPath = join(root, `${folderName}-activated.txt`);
    const pidPath = join(root, `${folderName}-pid.txt`);

    await mkdir(pluginRoot, { recursive: true });
    await writeJson(join(pluginRoot, "plugin.json"), {
        id: pluginId,
        name: folderName,
        version: "1.0.0",
        main: "dist/index.js",
        serverMain: options.serverMain ?? "server.js",
        permissions: options.permissions ?? ["server:process"],
        ...(options.enabled === false ? { enabled: false } : {}),
    });

    if (options.mainFile !== false) {
        await mkdir(join(pluginRoot, "dist"), { recursive: true });
        await writeFile(
            join(pluginRoot, "dist", "index.js"),
            "export function activate() {}\n",
            "utf8",
        );
    }

    await writeFile(
        join(pluginRoot, "server.js"),
        options.body ??
            `import { writeFileSync } from "node:fs";

export async function activate(host) {
    writeFileSync(${JSON.stringify(markerPath)}, "activated");
    const child = host.spawn(process.execPath, ["-e", "setInterval(() => {}, 500)"]);
    writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));
    return {
        handle(request, subpath) {
            return new Response("ok:" + subpath);
        },
    };
}
`,
        "utf8",
    );

    return { pluginId, pluginRoot, markerPath, pidPath };
}

async function writeInstallMetadata(pluginRoot: string, pluginId: string) {
    await writeJson(join(pluginRoot, "smileychat-install.json"), {
        source: "registry",
        pluginId,
        artifactUrl: `https://example.com/${pluginId}.zip`,
        installedAt: new Date().toISOString(),
    });
}

async function grantServerProcess(
    pluginId: string,
    grantsPath: string,
    permissions: string[] = ["server:process"],
) {
    await writePluginPermissionGrant(
        pluginId,
        { permissions },
        {
            readManifests: async () => [
                { id: pluginId, permissions: ["server:process"] },
            ],
            pathname: grantsPath,
        },
    );
}

function syncWith(root: string, grantsPath: string) {
    return syncPluginServers({
        pluginsRoot: root,
        pluginHasGrant: (pluginId, permission) =>
            pluginHasGrant(pluginId, permission, grantsPath),
    });
}

async function readPid(path: string) {
    const pid = Number.parseInt(await readText(path), 10);

    expect(Number.isSafeInteger(pid)).toBe(true);
    return pid;
}

function pluginZip(pluginId: string, version: string) {
    const zip = new AdmZip();

    zip.addFile(
        "plugin.json",
        Buffer.from(
            JSON.stringify({
                id: pluginId,
                name: pluginId,
                version,
                main: "dist/index.js",
                serverMain: "server.js",
                permissions: ["server:process"],
                category: "tools",
            }),
        ),
    );
    zip.addFile("dist/index.js", Buffer.from("export function activate() {}\n"));
    zip.addFile(
        "server.js",
        Buffer.from(
            "export function activate() {\n    return { handle() { return new Response('v2'); } };\n}\n",
        ),
    );

    return zip.toBuffer();
}

describe("plugin server sync", () => {
    test("a plugin without the grant is never loaded", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const fixture = await makeServerPlugin(root, uniqueId("no-grant"));

        await syncWith(root, grantsPath);

        expect(await exists(fixture.markerPath)).toBe(false);
        expect(getPluginServerStatus(fixture.pluginId).state).toBe("stopped");

        const response = await handlePluginServerRequest(
            fixture.pluginId,
            new Request("http://localhost/"),
            "/",
        );

        expect(response.status).toBe(503);
    });

    test("an enabled, granted plugin activates and answers host requests", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const fixture = await makeServerPlugin(root, uniqueId("granted"));

        await grantServerProcess(fixture.pluginId, grantsPath);
        await syncWith(root, grantsPath);

        expect(await readText(fixture.markerPath)).toBe("activated");
        expect(getPluginServerStatus(fixture.pluginId).state).toBe("running");

        const response = await handlePluginServerRequest(
            fixture.pluginId,
            new Request("http://localhost/health"),
            "/health",
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("ok:/health");

        // A second sync on the same files must not reload the plugin.
        const startedAt = getPluginServerStatus(fixture.pluginId).startedAt;
        await syncWith(root, grantsPath);
        expect(getPluginServerStatus(fixture.pluginId).startedAt).toBe(startedAt);
    });

    test("disabling the plugin stops it and leaves the folder replaceable", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const fixture = await makeServerPlugin(root, uniqueId("disabled"));

        await grantServerProcess(fixture.pluginId, grantsPath);
        await syncWith(root, grantsPath);

        const pid = await readPid(fixture.pidPath);
        expect(isRunning(pid)).toBe(true);

        await writeJson(join(fixture.pluginRoot, "plugin.json"), {
            id: fixture.pluginId,
            name: fixture.pluginId,
            version: "1.0.0",
            main: "dist/index.js",
            serverMain: "server.js",
            permissions: ["server:process"],
            enabled: false,
        });

        await syncWith(root, grantsPath);

        expect(await waitUntilDead(pid)).toBe(true);
        expect(getPluginServerStatus(fixture.pluginId).state).toBe("stopped");

        // Windows refuses the rename while anything still holds the folder.
        await expect(
            pluginInstallTestInternals.installPluginArtifact(
                pluginZip(fixture.pluginId, "2.0.0"),
                {
                    expectedPluginId: fixture.pluginId,
                    grantsPath,
                    pluginsRoot: root,
                    // The grant survives a toggle, so replacing it stays a
                    // privileged operation.
                    privileged: true,
                    source: {
                        source: "registry",
                        pluginId: fixture.pluginId,
                        artifactUrl: `https://example.com/${fixture.pluginId}.zip`,
                    },
                },
            ),
        ).resolves.toBeInstanceOf(Response);
    });

    test("revoking the grant stops the module", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const fixture = await makeServerPlugin(root, uniqueId("revoked"));

        await grantServerProcess(fixture.pluginId, grantsPath);
        await syncWith(root, grantsPath);

        const pid = await readPid(fixture.pidPath);
        expect(isRunning(pid)).toBe(true);

        await grantServerProcess(fixture.pluginId, grantsPath, []);
        await syncWith(root, grantsPath);

        expect(await waitUntilDead(pid)).toBe(true);
        expect(getPluginServerStatus(fixture.pluginId).state).toBe("stopped");
    });

    test("a granted plugin cannot be replaced without privileged access", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const fixture = await makeServerPlugin(root, uniqueId("privileged-update"));

        await writeInstallMetadata(fixture.pluginRoot, fixture.pluginId);
        await grantServerProcess(fixture.pluginId, grantsPath);
        await syncWith(root, grantsPath);

        const pid = await readPid(fixture.pidPath);
        const zip = pluginZip(fixture.pluginId, "2.0.0");
        const source = {
            source: "registry" as const,
            pluginId: fixture.pluginId,
            artifactUrl: `https://example.com/${fixture.pluginId}.zip`,
        };

        await expect(
            pluginInstallTestInternals.installPluginArtifact(zip, {
                expectedPluginId: fixture.pluginId,
                grantsPath,
                pluginsRoot: root,
                source,
            }),
        ).rejects.toThrow("requires privileged access");

        // The rejected replacement left the running plugin alone.
        expect(isRunning(pid)).toBe(true);
        expect(getPluginServerStatus(fixture.pluginId).state).toBe("running");

        const response = await pluginInstallTestInternals.installPluginArtifact(zip, {
            expectedPluginId: fixture.pluginId,
            grantsPath,
            pluginsRoot: root,
            privileged: true,
            source,
        });

        expect((await response.json()).ok).toBe(true);
        // Stopped before the folder swap, so the process is gone and the rename
        // succeeded on this platform.
        expect(await waitUntilDead(pid)).toBe(true);
        expect(
            await Bun.file(join(fixture.pluginRoot, "plugin.json")).json(),
        ).toMatchObject({ version: "2.0.0" });
    });

    test("uninstalling stops the module and removes the folder", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const fixture = await makeServerPlugin(root, uniqueId("uninstall"));

        await writeInstallMetadata(fixture.pluginRoot, fixture.pluginId);
        await grantServerProcess(fixture.pluginId, grantsPath);
        await syncWith(root, grantsPath);

        const pid = await readPid(fixture.pidPath);
        expect(isRunning(pid)).toBe(true);

        await uninstallPlugin(fixture.pluginId, {
            deleteData: true,
            pluginsRoot: root,
        });

        expect(await waitUntilDead(pid)).toBe(true);
        expect(await exists(fixture.pluginRoot)).toBe(false);
    });

    test("one failing module does not block the others and reports an error status", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const bad = await makeServerPlugin(root, uniqueId("boom"), {
            body: `export function activate() {
    throw new Error("activate exploded");
}
`,
        });
        const good = await makeServerPlugin(root, uniqueId("survivor"));

        await grantServerProcess(bad.pluginId, grantsPath);
        await grantServerProcess(good.pluginId, grantsPath);
        await syncWith(root, grantsPath);

        expect(getPluginServerStatus(bad.pluginId).state).toBe("error");
        expect(getPluginServerStatus(bad.pluginId).error).toContain("activate exploded");
        expect(await readText(good.markerPath)).toBe("activated");

        const manifests = await readPluginManifests(root);
        const badManifest = manifests.find((manifest) => manifest.id === bad.pluginId);
        const goodManifest = manifests.find((manifest) => manifest.id === good.pluginId);

        expect(badManifest?.serverStatus).toMatchObject({ state: "error" });
        expect(badManifest?.serverStatus?.error).toContain("activate exploded");
        expect(goodManifest?.serverStatus).toMatchObject({ state: "running" });
    });

    test("a module is restarted when its files change", async () => {
        const root = await tempRoot();
        const grantsPath = join(root, "settings", "plugin-grants.json");
        const fixture = await makeServerPlugin(root, uniqueId("resignature"));

        await grantServerProcess(fixture.pluginId, grantsPath);
        await syncWith(root, grantsPath);

        const firstPid = await readPid(fixture.pidPath);
        const firstStartedAt = getPluginServerStatus(fixture.pluginId).startedAt;

        await Bun.sleep(10);
        await writeFile(
            join(fixture.pluginRoot, "server.js"),
            `${await readText(join(fixture.pluginRoot, "server.js"))}\n// changed\n`,
            "utf8",
        );

        await syncWith(root, grantsPath);

        expect(getPluginServerStatus(fixture.pluginId).startedAt).not.toBe(
            firstStartedAt,
        );
        expect(await waitUntilDead(firstPid)).toBe(true);
    });
});

describe("plugin server discovery", () => {
    test("an unsafe serverMain stays listed with an error and is never run", async () => {
        const root = await tempRoot();
        const unsafe = await makeServerPlugin(root, uniqueId("unsafe"), {
            serverMain: "../outside.js",
        });

        await writeFile(
            join(root, "outside.js"),
            "export function activate() {}\n",
            "utf8",
        );

        const manifests = await readPluginManifests(root);
        const manifest = manifests.find((candidate) => candidate.id === unsafe.pluginId);

        expect(manifest).toBeDefined();
        expect(manifest?.serverMain).toBeUndefined();
        expect(manifest?.serverStatus?.state).toBe("error");
        expect(manifest?.serverStatus?.error).toContain("not a safe relative path");
        // The browser half still loads.
        expect(manifest?.entryUrl).toContain("/plugins/");
    });

    test("an absolute serverMain is rejected at discovery", async () => {
        const root = await tempRoot();
        const fixture = await makeServerPlugin(root, uniqueId("absolute"), {
            serverMain: "C:/outside.js",
        });

        const manifests = await readPluginManifests(root);
        const manifest = manifests.find((candidate) => candidate.id === fixture.pluginId);

        expect(manifest?.serverMain).toBeUndefined();
        expect(manifest?.serverStatus?.state).toBe("error");
        expect(manifest?.serverStatus?.error).toContain("not a safe relative path");
    });

    test("a missing module and a missing permission are reported, not run", async () => {
        const root = await tempRoot();
        const missing = await makeServerPlugin(root, uniqueId("missing"), {
            serverMain: "server-missing.js",
        });
        const unpermitted = await makeServerPlugin(root, uniqueId("unpermitted"), {
            permissions: [],
        });

        const manifests = await readPluginManifests(root);
        const missingManifest = manifests.find(
            (candidate) => candidate.id === missing.pluginId,
        );
        const unpermittedManifest = manifests.find(
            (candidate) => candidate.id === unpermitted.pluginId,
        );

        expect(missingManifest?.serverMain).toBeUndefined();
        expect(missingManifest?.serverStatus?.error).toContain("does not exist");
        expect(unpermittedManifest?.serverMain).toBeUndefined();
        expect(unpermittedManifest?.serverStatus?.error).toContain(
            "must declare the server:process permission",
        );
    });

    test("a plugin without a server module keeps its old manifest shape", async () => {
        const root = await tempRoot();
        const pluginId = uniqueId("plain");
        const pluginRoot = join(root, pluginId);

        await mkdir(join(pluginRoot, "dist"), { recursive: true });
        await writeJson(join(pluginRoot, "plugin.json"), {
            id: pluginId,
            name: pluginId,
            version: "1.0.0",
            main: "dist/index.js",
        });
        await writeFile(join(pluginRoot, "dist", "index.js"), "export {};\n", "utf8");

        const manifest = (await readPluginManifests(root)).find(
            (candidate) => candidate.id === pluginId,
        );

        expect(manifest).toBeDefined();
        expect(manifest).not.toHaveProperty("serverMain");
        expect(manifest).not.toHaveProperty("serverStatus");
    });
});

describe("plugin host cross-site check", () => {
    test("only another site's browser request counts as cross-site", () => {
        const header = (value: string) => new Headers({ "sec-fetch-site": value });

        // No header: curl, tests, non-browser clients. Not a cross-site request.
        expect(hostRequestIsCrossSite(new Headers())).toBe(false);
        expect(hostRequestIsCrossSite(header(""))).toBe(false);

        // The app itself, including through the Vite dev proxy, and a direct
        // navigation (typing the URL, a bookmark).
        expect(hostRequestIsCrossSite(header("same-origin"))).toBe(false);
        expect(hostRequestIsCrossSite(header("none"))).toBe(false);

        // A sibling origin and any other site.
        expect(hostRequestIsCrossSite(header("same-site"))).toBe(true);
        expect(hostRequestIsCrossSite(header("cross-site"))).toBe(true);

        // Browsers send lowercase, but do not depend on it.
        expect(hostRequestIsCrossSite(header("Same-Origin"))).toBe(false);
        expect(hostRequestIsCrossSite(header(" CROSS-SITE "))).toBe(true);
    });
});

describe("plugin host subpath", () => {
    test("keeps the path after /api/plugins/<id>/host", () => {
        expect(pluginHostRequestSubpath("/api/plugins/demo/host")).toEqual({
            ok: true,
            subpath: "/",
        });
        expect(pluginHostRequestSubpath("/api/plugins/demo/host/")).toEqual({
            ok: true,
            subpath: "/",
        });
        expect(pluginHostRequestSubpath("/api/plugins/demo/host/items/1")).toEqual({
            ok: true,
            subpath: "/items/1",
        });
        // Percent-encoding belongs to the plugin's handler.
        expect(
            pluginHostRequestSubpath("/api/plugins/demo/host/files/a%20b.txt"),
        ).toEqual({ ok: true, subpath: "/files/a%20b.txt" });
    });

    test("refuses dot segments and backslashes in raw or encoded form", () => {
        for (const pathname of [
            "/api/plugins/demo/host/../../secrets",
            "/api/plugins/demo/host/%2e%2e/secrets",
            "/api/plugins/demo/host/a/./b",
            "/api/plugins/demo/host/a%5Cb",
            "/api/plugins/demo/host/a\\b",
            "/api/plugins/demo/host/%zz",
        ]) {
            expect(pluginHostRequestSubpath(pathname).ok).toBe(false);
        }
    });
});

describe("plugin host routing", () => {
    test("Bun matches the wildcard without shadowing the specific routes", async () => {
        const hostHandler = (request: Request & { params: Record<string, string> }) => {
            const parsed = pluginHostRequestSubpath(new URL(request.url).pathname);

            if (!parsed.ok) {
                return Response.json({ error: parsed.error }, { status: 400 });
            }

            return Response.json({
                pluginId: request.params.pluginId,
                subpath: parsed.subpath,
            });
        };

        const server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            routes: {
                "/api/plugins/install": { POST: () => new Response("install") },
                "/api/plugins/grants/:pluginId": { PUT: () => new Response("grants") },
                "/api/plugins/:pluginId/update": { POST: () => new Response("update") },
                "/api/plugins/:pluginId/logs": { POST: () => new Response("logs") },
                "/api/plugins/:pluginId/storage/:key": {
                    GET: (request) => new Response(`storage:${request.params.key}`),
                },
                "/api/plugins/:pluginId": {
                    PUT: (request) => new Response(`plugin:${request.params.pluginId}`),
                },
                "/api/plugins/:pluginId/host": { GET: hostHandler, HEAD: hostHandler },
                "/api/plugins/:pluginId/host/*": {
                    GET: hostHandler,
                    HEAD: hostHandler,
                    POST: hostHandler,
                },
                "/api/*": () => new Response("fallback", { status: 404 }),
            },
        });

        const base = `http://127.0.0.1:${server.port}`;

        try {
            const root = await fetch(`${base}/api/plugins/demo/host`);
            expect(await root.json()).toEqual({ pluginId: "demo", subpath: "/" });

            const nested = await fetch(`${base}/api/plugins/demo/host/items/1?verbose=1`);
            expect(await nested.json()).toEqual({
                pluginId: "demo",
                subpath: "/items/1",
            });

            const post = await fetch(`${base}/api/plugins/demo/host/status`, {
                method: "POST",
            });
            expect(await post.json()).toEqual({ pluginId: "demo", subpath: "/status" });

            // The WHATWG URL parser already collapses `%2e%2e`, so this never
            // reaches the host route at all; the raw form is covered by the
            // `pluginHostRequestSubpath` cases above.
            const traversal = await fetch(
                `${base}/api/plugins/demo/host/%2e%2e/connection-secrets.json`,
            );
            expect(traversal.status).toBe(404);

            expect(
                await (await fetch(`${base}/api/plugins/demo/storage/settings`)).text(),
            ).toBe("storage:settings");
            expect(
                await (
                    await fetch(`${base}/api/plugins/demo`, {
                        method: "PUT",
                        body: "{}",
                    })
                ).text(),
            ).toBe("plugin:demo");
            expect(
                await (
                    await fetch(`${base}/api/plugins/demo/update`, { method: "POST" })
                ).text(),
            ).toBe("update");
            expect(
                await (
                    await fetch(`${base}/api/plugins/demo/logs`, { method: "POST" })
                ).text(),
            ).toBe("logs");
            expect(
                await (
                    await fetch(`${base}/api/plugins/grants/demo`, {
                        method: "PUT",
                        body: "{}",
                    })
                ).text(),
            ).toBe("grants");
            expect(
                await (
                    await fetch(`${base}/api/plugins/install`, { method: "POST" })
                ).text(),
            ).toBe("install");

            const head = await fetch(`${base}/api/plugins/demo/host/health?probe=1`, {
                method: "HEAD",
            });
            expect(head.status).toBe(200);
        } finally {
            server.stop(true);
        }
    });
});
