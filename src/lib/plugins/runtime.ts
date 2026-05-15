import { h } from "preact";
import {
    corePlugins,
    getCorePlugin,
    mergeCoreAndUserPluginManifests,
} from "../../core-extensions";
import {
    createPluginApi,
    deactivatePlugin,
    initializePluginEnabledStates,
    recordPluginDisposer,
    recordLoadedPlugin,
} from "./registry";
import { localApiFetch } from "../api/client";
import type { PluginManifest, PluginStorageApi, SmileyPluginModule } from "./types";

export async function loadRuntimePlugins(manifests: PluginManifest[]) {
    const runtimeManifests = mergeCoreAndUserPluginManifests(manifests);
    initializePluginEnabledStates(runtimeManifests);

    await Promise.all(
        corePlugins
            .map((plugin) => ({
                ...plugin,
                manifest:
                    runtimeManifests.find(
                        (manifest) => manifest.id === plugin.manifest.id,
                    ) ?? plugin.manifest,
            }))
            .filter((plugin) => plugin.manifest.enabled !== false)
            .map((plugin) => loadBundledRuntimePlugin(plugin.manifest, plugin.module)),
    );

    await Promise.all(
        manifests
            .filter(
                (manifest) =>
                    manifest.enabled !== false &&
                    manifest.entryUrl &&
                    !runtimeManifests.some(
                        (runtimeManifest) =>
                            runtimeManifest.source === "core" &&
                            runtimeManifest.id === manifest.id,
                    ),
            )
            .map((manifest) => loadRuntimePlugin(manifest)),
    );
}

async function loadBundledRuntimePlugin(
    manifest: PluginManifest,
    module: SmileyPluginModule,
) {
    try {
        deactivatePlugin(manifest.id);

        const dispose = await module.activate(
            createPluginApi(manifest, createPluginStorage(manifest.id), h),
        );

        recordPluginDisposer(
            manifest.id,
            typeof dispose === "function" ? dispose : undefined,
        );
        recordLoadedPlugin({ manifest, status: "loaded" });
    } catch (error) {
        deactivatePlugin(manifest.id);
        recordLoadedPlugin({
            manifest,
            status: "error",
            error:
                error instanceof Error ? error.message : "Could not load core extension.",
        });
    }
}

export async function loadCoreRuntimePlugin(pluginId: string) {
    const plugin = getCorePlugin(pluginId);

    if (!plugin) {
        throw new Error(`Core extension ${pluginId} was not found.`);
    }

    await loadBundledRuntimePlugin(plugin.manifest, plugin.module);
}

export async function loadRuntimePlugin(manifest: PluginManifest) {
    try {
        if (!manifest.entryUrl) {
            throw new Error(`${manifest.name} does not define a plugin entry URL.`);
        }

        deactivatePlugin(manifest.id);

        if (manifest.styleUrls?.length) {
            requirePluginPermission(manifest, "ui:styles");
        }

        for (const styleUrl of manifest.styleUrls ?? []) {
            attachPluginStylesheet(manifest.id, styleUrl);
        }

        const module = (await import(
            /* @vite-ignore */ manifest.entryUrl
        )) as Partial<SmileyPluginModule>;

        if (typeof module.activate !== "function") {
            throw new Error(`${manifest.name} does not export activate(api).`);
        }

        const dispose = await module.activate(
            createPluginApi(manifest, createPluginStorage(manifest.id), h),
        );

        recordPluginDisposer(
            manifest.id,
            typeof dispose === "function" ? dispose : undefined,
        );
        recordLoadedPlugin({ manifest, status: "loaded" });
    } catch (error) {
        deactivatePlugin(manifest.id);
        recordLoadedPlugin({
            manifest,
            status: "error",
            error: error instanceof Error ? error.message : "Could not load plugin.",
        });
    }
}

function attachPluginStylesheet(pluginId: string, href: string) {
    if (
        document.querySelector(
            `link[data-plugin-id="${CSS.escape(pluginId)}"][href="${href}"]`,
        )
    ) {
        return;
    }

    const link = document.createElement("link");
    link.dataset.pluginId = pluginId;
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
}

export function createPluginStorage(pluginId: string): PluginStorageApi {
    return {
        async getJson(key, fallback) {
            const response = await localApiFetch(pluginStorageUrl(pluginId, key));

            if (response.status === 404) {
                return fallback;
            }

            if (!response.ok) {
                throw new Error(`Load plugin storage failed: ${response.status}`);
            }

            return (await response.json()) as typeof fallback;
        },
        async setJson(key, value) {
            const response = await localApiFetch(pluginStorageUrl(pluginId, key), {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(value),
            });

            if (!response.ok) {
                throw new Error(`Save plugin storage failed: ${response.status}`);
            }
        },
        async remove(key) {
            const response = await localApiFetch(pluginStorageUrl(pluginId, key), {
                method: "DELETE",
            });

            if (!response.ok && response.status !== 404) {
                throw new Error(`Remove plugin storage failed: ${response.status}`);
            }
        },
    };
}

function pluginStorageUrl(pluginId: string, key: string) {
    return `/api/plugins/${encodeURIComponent(pluginId)}/storage/${encodeURIComponent(key)}`;
}

function requirePluginPermission(manifest: PluginManifest, permission: string) {
    if (manifest.permissions?.includes(permission)) {
        return;
    }

    throw new Error(`${manifest.name} needs "${permission}" permission.`);
}
