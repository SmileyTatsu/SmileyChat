import { Copy, Plus, Trash2 } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";

import { saveConnectionSecrets, saveConnectionSettings } from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import {
    createConnectionProfile,
    extractConnectionSecrets,
    getActiveConnectionProfile,
    isGoogleAIProfile,
    isOpenAICompatibleProfile,
    isOpenRouterProfile,
    sanitizeConnectionSecrets,
    sanitizeConnectionSettings,
    type ConnectionProfile,
    type ConnectionSettings,
} from "#frontend/lib/connections/config";
import {
    createGoogleAIConnection,
    createGoogleAIGenerateUrl,
} from "#frontend/lib/connections/google-ai/adapter";
import { listGoogleAIModels } from "#frontend/lib/connections/google-ai/models";
import type { GoogleAIModel } from "#frontend/lib/connections/google-ai/types";
import { trimTrailingSlash } from "#frontend/lib/connections/http";
import { createOpenAICompatibleConnection } from "#frontend/lib/connections/openai-compatible/adapter";
import { listOpenAICompatibleModels } from "#frontend/lib/connections/openai-compatible/models";
import type { OpenAICompatibleModel } from "#frontend/lib/connections/openai-compatible/types";
import { createOpenRouterConnection } from "#frontend/lib/connections/openrouter/adapter";
import { listOpenRouterModels } from "#frontend/lib/connections/openrouter/models";
import type { OpenRouterModel } from "#frontend/lib/connections/openrouter/types";
import { createUserMessage } from "#frontend/lib/messages";
import { defaultPersona } from "#frontend/lib/personas/defaults";
import {
    getPluginConnectionProvider,
    getPluginConnectionProviders,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";

import { GoogleAIConnection } from "./providers/google-ai-connection";
import { OpenAICompatibleConnection } from "./providers/openai-compatible-connection";
import { OpenRouterConnection } from "./providers/openrouter-connection";

type RequestState = "idle" | "loading" | "success" | "error";

type ConnectionsSettingsProps = {
    loadError?: string;
    settings: ConnectionSettings;
    onSettingsChange: (settings: ConnectionSettings) => void;
};

export function ConnectionsSettings({
    loadError,
    settings,
    onSettingsChange,
}: ConnectionsSettingsProps) {
    const [modelsByProfileId, setModelsByProfileId] = useState<
        Record<string, OpenAICompatibleModel[]>
    >({});
    const [openRouterModelsByProfileId, setOpenRouterModelsByProfileId] = useState<
        Record<string, OpenRouterModel[]>
    >({});
    const [googleAIModelsByProfileId, setGoogleAIModelsByProfileId] = useState<
        Record<string, GoogleAIModel[]>
    >({});
    const [requestState, setRequestState] = useState<RequestState>("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [, setRegistryRevision] = useState(0);

    const activeProfile = getActiveConnectionProfile(settings);
    const isBusy = requestState === "loading";
    const activeModels = activeProfile ? (modelsByProfileId[activeProfile.id] ?? []) : [];
    const activeOpenRouterModels = activeProfile
        ? (openRouterModelsByProfileId[activeProfile.id] ?? [])
        : [];
    const activeGoogleAIModels = activeProfile
        ? (googleAIModelsByProfileId[activeProfile.id] ?? [])
        : [];
    const pluginProviders = getPluginConnectionProviders();
    const activePluginProvider = activeProfile
        ? getPluginConnectionProvider(activeProfile.provider)
        : undefined;

    useEffect(() => {
        if (loadError) {
            setStatusMessage(loadError);
            setRequestState("error");
        }
    }, [loadError]);

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    useEffect(() => {
        if (!activeProfile) {
            return;
        }

        setModelsByProfileId((current) => ({
            ...current,
            [activeProfile.id]: [],
        }));
        setOpenRouterModelsByProfileId((current) => ({
            ...current,
            [activeProfile.id]: [],
        }));
        setGoogleAIModelsByProfileId((current) => ({
            ...current,
            [activeProfile.id]: [],
        }));
    }, [
        activeProfile?.id,
        isOpenAICompatibleProfile(activeProfile)
            ? activeProfile.config.baseUrl
            : undefined,
        isOpenAICompatibleProfile(activeProfile)
            ? activeProfile.config.apiKey
            : undefined,
        isOpenRouterProfile(activeProfile) ? activeProfile.config.apiKey : undefined,
        isGoogleAIProfile(activeProfile) ? activeProfile.config.baseUrl : undefined,
        isGoogleAIProfile(activeProfile) ? activeProfile.config.apiKey : undefined,
    ]);

    useEffect(() => {
        if (!activeProfile) return;
        if (
            isOpenAICompatibleProfile(activeProfile) &&
            activeProfile.config.model.source === "api" &&
            activeProfile.config.baseUrl.trim().length > 0
        ) {
            void loadModels();
            return;
        }
        if (
            isOpenRouterProfile(activeProfile) &&
            activeProfile.config.model.source === "api"
        ) {
            void loadModels();
            return;
        }
        if (
            isGoogleAIProfile(activeProfile) &&
            activeProfile.config.model.source === "api" &&
            activeProfile.config.baseUrl.trim().length > 0
        ) {
            void loadModels();
        }
        // loadModels is intentionally omitted — we only want to auto-fetch
        // when the active profile id changes (panel open / profile switch),
        // not on every keystroke in baseUrl / apiKey.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProfile?.id]);

    async function saveSettings(nextSettings = settings) {
        setRequestState("loading");

        try {
            const safeSettings = sanitizeConnectionSettings(nextSettings);
            const secrets = extractConnectionSecrets(nextSettings);
            await saveConnectionSettings(safeSettings);
            await saveConnectionSecrets(secrets);

            setStatusMessage("Connection profiles saved.");
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Unexpected connection error."));
            setRequestState("error");
        }
    }

    async function clearApiKey() {
        if (!activeProfile) {
            return;
        }

        setRequestState("loading");

        try {
            const nextSettings = updateProfileConfig(settings, activeProfile.id, {
                ...activeProfile.config,
                apiKey: undefined,
            });
            onSettingsChange(nextSettings);

            const nextSecrets = extractConnectionSecrets(nextSettings);
            await saveConnectionSecrets(sanitizeConnectionSecrets(nextSecrets));

            setStatusMessage(`API key removed from ${activeProfile.name}.`);
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Unexpected connection error."));
            setRequestState("error");
        }
    }

    async function testConnection() {
        if (!activeProfile) {
            return;
        }

        if (!isOpenAICompatibleProfile(activeProfile)) {
            if (isOpenRouterProfile(activeProfile)) {
                setRequestState("loading");
                setStatusMessage(
                    "Testing POST https://openrouter.ai/api/v1/chat/completions",
                );

                try {
                    const adapter = createOpenRouterConnection({
                        ...activeProfile.config,
                        apiKey: activeProfile.config.apiKey?.trim() || undefined,
                    });
                    const result = await adapter.generate({
                        context: "Reply briefly to confirm the connection works.",
                        messages: [createUserMessage("hello", defaultPersona)],
                    });

                    setStatusMessage(
                        `OpenRouter connection test succeeded: ${result.message}`,
                    );
                    setRequestState("success");
                } catch (error) {
                    setStatusMessage(
                        messageFromError(error, "Unexpected connection error."),
                    );
                    setRequestState("error");
                }

                return;
            }

            if (isGoogleAIProfile(activeProfile)) {
                const targetUrl = createGoogleAIGenerateUrl(
                    {
                        ...activeProfile.config,
                        apiKey: undefined,
                    },
                    false,
                );

                setRequestState("loading");
                setStatusMessage(`Testing POST ${targetUrl}`);

                try {
                    const adapter = createGoogleAIConnection({
                        ...activeProfile.config,
                        apiKey: activeProfile.config.apiKey?.trim() || undefined,
                    });
                    const result = await adapter.generate({
                        context: "Reply briefly to confirm the connection works.",
                        messages: [createUserMessage("hello", defaultPersona)],
                    });

                    setStatusMessage(
                        `Google AI connection test succeeded: ${result.message}`,
                    );
                    setRequestState("success");
                } catch (error) {
                    setStatusMessage(
                        messageFromError(error, "Unexpected connection error."),
                    );
                    setRequestState("error");
                }

                return;
            }

            if (!activePluginProvider?.testConnection) {
                setStatusMessage(
                    `${activeProfile.name} does not provide a connection test.`,
                );
                setRequestState("error");
                return;
            }

            setRequestState("loading");

            try {
                setStatusMessage(
                    await activePluginProvider.testConnection(activeProfile),
                );
                setRequestState("success");
            } catch (error) {
                setStatusMessage(messageFromError(error, "Unexpected connection error."));
                setRequestState("error");
            }

            return;
        }

        setRequestState("loading");
        setStatusMessage(
            `Testing POST ${trimTrailingSlash(activeProfile.config.baseUrl)}/chat/completions`,
        );

        try {
            const adapter = createOpenAICompatibleConnection({
                ...activeProfile.config,
                apiKey: activeProfile.config.apiKey?.trim() || undefined,
            });
            const result = await adapter.generate({
                context: "Reply briefly to confirm the connection works.",
                messages: [createUserMessage("hello", defaultPersona)],
            });

            setStatusMessage(
                `Connection test succeeded via ${trimTrailingSlash(activeProfile.config.baseUrl)}/chat/completions: ${result.message}`,
            );
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Unexpected connection error."));
            setRequestState("error");
        }
    }

    async function loadModels() {
        if (isOpenRouterProfile(activeProfile)) {
            setRequestState("loading");
            setStatusMessage(
                "Loading models from GET https://openrouter.ai/api/v1/models",
            );

            try {
                const nextModels = await listOpenRouterModels({
                    apiKey: activeProfile.config.apiKey?.trim() || undefined,
                });

                setOpenRouterModelsByProfileId((current) => ({
                    ...current,
                    [activeProfile.id]: nextModels,
                }));

                if (
                    activeProfile.config.model.source === "api" &&
                    !activeProfile.config.model.id &&
                    nextModels[0]
                ) {
                    updateActiveProfileConfig({
                        ...activeProfile.config,
                        model: {
                            source: "api",
                            id: nextModels[0].id,
                        },
                    });
                }

                setStatusMessage(`Loaded ${nextModels.length} OpenRouter model(s).`);
                setRequestState("success");
            } catch (error) {
                setStatusMessage(messageFromError(error, "Unexpected connection error."));
                setRequestState("error");
            }

            return;
        }

        if (isGoogleAIProfile(activeProfile)) {
            setRequestState("loading");
            setStatusMessage(
                `Loading models from GET ${trimTrailingSlash(activeProfile.config.baseUrl)}/models`,
            );

            try {
                const nextModels = await listGoogleAIModels({
                    apiKey: activeProfile.config.apiKey?.trim() || undefined,
                    baseUrl: activeProfile.config.baseUrl,
                });

                setGoogleAIModelsByProfileId((current) => ({
                    ...current,
                    [activeProfile.id]: nextModels,
                }));

                if (nextModels[0] && activeProfile.config.model.source !== "custom") {
                    const currentId = activeProfile.config.model.id;
                    const currentIsLoaded =
                        activeProfile.config.model.source === "api" &&
                        nextModels.some(
                            (model) =>
                                model.name === currentId ||
                                model.baseModelId === currentId,
                        );

                    if (!currentIsLoaded) {
                        updateActiveProfileConfig({
                            ...activeProfile.config,
                            model: {
                                source: "api",
                                id: nextModels[0].baseModelId ?? nextModels[0].name,
                            },
                        });
                    }
                }

                setStatusMessage(`Loaded ${nextModels.length} Google AI model(s).`);
                setRequestState("success");
            } catch (error) {
                setStatusMessage(messageFromError(error, "Unexpected connection error."));
                setRequestState("error");
            }

            return;
        }

        if (!isOpenAICompatibleProfile(activeProfile)) {
            return;
        }

        setRequestState("loading");
        setStatusMessage(
            `Loading models from GET ${trimTrailingSlash(activeProfile.config.baseUrl)}/models`,
        );

        try {
            const nextModels = await listOpenAICompatibleModels({
                apiKey: activeProfile.config.apiKey?.trim() || undefined,
                baseUrl: activeProfile.config.baseUrl,
            });

            setModelsByProfileId((current) => ({
                ...current,
                [activeProfile.id]: nextModels,
            }));

            if (nextModels[0] && activeProfile.config.model.source !== "custom") {
                const currentId = activeProfile.config.model.id;
                const currentIsLoaded =
                    activeProfile.config.model.source === "api" &&
                    nextModels.some((model) => model.id === currentId);

                if (!currentIsLoaded) {
                    updateActiveProfileConfig({
                        ...activeProfile.config,
                        model: {
                            source: "api",
                            id: nextModels[0].id,
                        },
                    });
                }
            }

            setStatusMessage(
                `Loaded ${nextModels.length} model(s) from ${trimTrailingSlash(activeProfile.config.baseUrl)}/models.`,
            );
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Unexpected connection error."));
            setRequestState("error");
        }
    }

    function updateActiveProfileConfig(nextConfig: Record<string, unknown>) {
        if (!activeProfile) {
            return;
        }

        onSettingsChange(updateProfileConfig(settings, activeProfile.id, nextConfig));
    }

    function updateActiveProfileName(name: string) {
        if (!activeProfile) {
            return;
        }

        onSettingsChange(updateProfile(settings, activeProfile.id, { name }));
    }

    function addProfile() {
        const profile = createConnectionProfile(
            "openai-compatible",
            `OpenAI compatible ${settings.profiles.length + 1}`,
        );
        const nextSettings = {
            ...settings,
            activeProfileId: profile.id,
            profiles: [...settings.profiles, profile],
        };

        onSettingsChange(nextSettings);
        setStatusMessage("Created connection profile.");
        setRequestState("success");
    }

    function addPluginProfile(providerId: string) {
        const provider = getPluginConnectionProvider(providerId);

        if (!provider) {
            return;
        }

        const profile = createConnectionProfile(
            provider.id,
            provider.label,
            provider.defaultConfig,
        );
        const nextSettings = {
            ...settings,
            activeProfileId: profile.id,
            profiles: [...settings.profiles, profile],
        };

        onSettingsChange(nextSettings);
        setStatusMessage(`Created ${provider.label} profile.`);
        setRequestState("success");
    }

    function changeActiveProvider(providerId: string) {
        if (!activeProfile || activeProfile.provider === providerId) {
            return;
        }

        const provider = getPluginConnectionProvider(providerId);
        const config =
            providerId === "openai-compatible" ||
            providerId === "openrouter" ||
            providerId === "google-ai"
                ? undefined
                : (provider?.defaultConfig ?? {});
        const nextProfile = createConnectionProfile(
            providerId,
            providerId === "openrouter"
                ? "OpenRouter"
                : providerId === "google-ai"
                  ? "Google AI"
                  : (provider?.label ?? "OpenAI compatible"),
            config,
        );

        onSettingsChange(
            updateProfile(settings, activeProfile.id, {
                provider: nextProfile.provider,
                config: nextProfile.config,
            }),
        );
        setStatusMessage("Changed provider. Save to keep this profile.");
        setRequestState("success");
    }

    function duplicateProfile() {
        if (!activeProfile) {
            return;
        }

        const now = new Date().toISOString();
        const profile = {
            ...createConnectionProfile(
                activeProfile.provider,
                `${activeProfile.name} Copy`,
            ),
            config: {
                ...activeProfile.config,
                apiKey: undefined,
            },
            createdAt: now,
            updatedAt: now,
        };
        const nextSettings = {
            ...settings,
            activeProfileId: profile.id,
            profiles: [...settings.profiles, profile],
        };

        onSettingsChange(nextSettings);
        setStatusMessage("Duplicated connection profile without copying its API key.");
        setRequestState("success");
    }

    function deleteProfile() {
        if (!activeProfile || settings.profiles.length <= 1) {
            return;
        }

        const profiles = settings.profiles.filter(
            (profile) => profile.id !== activeProfile.id,
        );
        const nextSettings = {
            ...settings,
            activeProfileId: profiles[0].id,
            profiles,
        };

        onSettingsChange(nextSettings);
        setModelsByProfileId((current) => {
            const next = { ...current };
            delete next[activeProfile.id];
            return next;
        });
        setOpenRouterModelsByProfileId((current) => {
            const next = { ...current };
            delete next[activeProfile.id];
            return next;
        });
        setGoogleAIModelsByProfileId((current) => {
            const next = { ...current };
            delete next[activeProfile.id];
            return next;
        });
        setStatusMessage("Deleted connection profile. Save to remove it from disk.");
        setRequestState("success");
    }

    return (
        <section className="tool-window">
            <h2>Connections</h2>

            <div className="connection-profile-toolbar">
                <label>
                    Profile
                    <select
                        value={settings.activeProfileId}
                        onInput={(event) =>
                            onSettingsChange({
                                ...settings,
                                activeProfileId: (
                                    event.currentTarget as HTMLSelectElement
                                ).value,
                            })
                        }
                    >
                        {settings.profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.name}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="button-row">
                    <button type="button" disabled={isBusy} onClick={addProfile}>
                        <Plus size={16} />
                        New
                    </button>
                    <button
                        type="button"
                        disabled={isBusy || !activeProfile}
                        onClick={duplicateProfile}
                    >
                        <Copy size={16} />
                        Duplicate
                    </button>
                    <button
                        className="danger-button"
                        type="button"
                        disabled={isBusy || settings.profiles.length <= 1}
                        onClick={deleteProfile}
                    >
                        <Trash2 size={16} />
                        Delete
                    </button>
                </div>
            </div>

            {activeProfile && (
                <>
                    <div className="connection-profile-fields">
                        <label>
                            Profile name
                            <input
                                value={activeProfile.name}
                                onInput={(event) =>
                                    updateActiveProfileName(
                                        (event.currentTarget as HTMLInputElement).value,
                                    )
                                }
                            />
                        </label>
                        <label>
                            Provider
                            <select
                                value={activeProfile.provider}
                                disabled={isBusy}
                                onInput={(event) =>
                                    changeActiveProvider(
                                        (event.currentTarget as HTMLSelectElement).value,
                                    )
                                }
                            >
                                <option value="openai-compatible">
                                    OpenAI compatible
                                </option>
                                <option value="openrouter">OpenRouter</option>
                                <option value="google-ai">Google AI</option>
                                {pluginProviders.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                        {provider.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {isOpenAICompatibleProfile(activeProfile) ? (
                        <OpenAICompatibleConnection
                            config={activeProfile.config}
                            disabled={isBusy}
                            models={activeModels}
                            onChange={(config) => updateActiveProfileConfig(config)}
                            onClearApiKey={clearApiKey}
                            onLoadModels={loadModels}
                            onSave={() => void saveSettings()}
                            onTest={testConnection}
                        />
                    ) : isOpenRouterProfile(activeProfile) ? (
                        <OpenRouterConnection
                            config={activeProfile.config}
                            disabled={isBusy}
                            models={activeOpenRouterModels}
                            onChange={(config) => updateActiveProfileConfig(config)}
                            onClearApiKey={clearApiKey}
                            onLoadModels={loadModels}
                            onSave={() => void saveSettings()}
                            onTest={testConnection}
                        />
                    ) : isGoogleAIProfile(activeProfile) ? (
                        <GoogleAIConnection
                            config={activeProfile.config}
                            disabled={isBusy}
                            models={activeGoogleAIModels}
                            onChange={(config) => updateActiveProfileConfig(config)}
                            onClearApiKey={clearApiKey}
                            onLoadModels={loadModels}
                            onSave={() => void saveSettings()}
                            onTest={testConnection}
                        />
                    ) : activePluginProvider?.renderSettings ? (
                        activePluginProvider.renderSettings({
                            profile: activeProfile,
                            disabled: isBusy,
                            onChange: updateActiveProfileConfig,
                            onSave: () => void saveSettings(),
                            onTest: testConnection,
                        })
                    ) : (
                        <div className="connection-card">
                            <p>
                                {activePluginProvider
                                    ? `${activePluginProvider.label} is registered by a plugin, but it does not provide a settings panel.`
                                    : "This plugin provider is not currently loaded."}
                            </p>
                            <div className="button-row">
                                <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void saveSettings()}
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void testConnection()}
                                >
                                    Test connection
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="button-row">
                {pluginProviders.map((provider) => (
                    <button
                        key={provider.id}
                        type="button"
                        disabled={isBusy}
                        onClick={() => addPluginProfile(provider.id)}
                    >
                        <Plus size={16} />
                        {provider.label}
                    </button>
                ))}
            </div>

            {statusMessage && (
                <p className={`connection-status ${requestState}`}>{statusMessage}</p>
            )}
        </section>
    );
}

function updateProfile(
    settings: ConnectionSettings,
    profileId: string,
    patch: Partial<ConnectionProfile>,
): ConnectionSettings {
    return {
        ...settings,
        profiles: settings.profiles.map((profile) =>
            profile.id === profileId
                ? {
                      ...profile,
                      ...patch,
                      updatedAt: new Date().toISOString(),
                  }
                : profile,
        ),
    };
}

function updateProfileConfig(
    settings: ConnectionSettings,
    profileId: string,
    config: Record<string, unknown>,
): ConnectionSettings {
    return updateProfile(settings, profileId, { config });
}
