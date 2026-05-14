import { useState } from "preact/hooks";
import {
    formatOpenRouterSlugList,
    parseOpenRouterSlugList,
} from "../../../../lib/connections/openrouter/mappers";
import type {
    OpenRouterConnectionConfig,
    OpenRouterModel,
    OpenRouterProviderPreferences,
    OpenRouterSort,
} from "../../../../lib/connections/openrouter/types";

type OpenRouterConnectionProps = {
    config: OpenRouterConnectionConfig;
    disabled?: boolean;
    models: OpenRouterModel[];
    onChange: (config: OpenRouterConnectionConfig) => void;
    onClearApiKey: () => void;
    onLoadModels: () => void;
    onSave: () => void;
    onTest: () => void;
};

export function OpenRouterConnection({
    config,
    disabled,
    models,
    onChange,
    onClearApiKey,
    onLoadModels,
    onSave,
    onTest,
}: OpenRouterConnectionProps) {
    const [modelSearch, setModelSearch] = useState("");

    function updateConfig(nextConfig: Partial<OpenRouterConnectionConfig>) {
        onChange({ ...config, ...nextConfig });
    }

    function updateProviderPreferences(
        nextPreferences: Partial<OpenRouterProviderPreferences>,
    ) {
        updateConfig({
            providerPreferences: {
                ...config.providerPreferences,
                ...nextPreferences,
            },
        });
    }

    function updateSelectedModel(value: string) {
        const separatorIndex = value.indexOf(":");
        const source = value.slice(0, separatorIndex);
        const id = value.slice(separatorIndex + 1);

        if (source === "api") {
            updateConfig({
                model: {
                    source: "api",
                    id,
                },
            });
            return;
        }
    }

    const selectedModelValue = config.model.id ? `api:${config.model.id}` : "api:";
    const preferences = config.providerPreferences;
    const selectedModel = models.find((model) => model.id === config.model.id);
    const filteredModels = filterModels(models, modelSearch);
    const selectedModelIsLoaded = models.some((model) => model.id === config.model.id);
    const selectedModelIsVisible = filteredModels.some(
        (model) => model.id === config.model.id,
    );

    return (
        <section className="connection-provider-panel">
            <h3>OpenRouter</h3>
            <label>
                API key
                <div className="inline-field-row">
                    <input
                        value={config.apiKey ?? ""}
                        type="password"
                        placeholder="Saved to userData/settings/connection-secrets.json"
                        onInput={(event) =>
                            updateConfig({
                                apiKey: (event.currentTarget as HTMLInputElement).value,
                            })
                        }
                    />
                    <button
                        type="button"
                        disabled={disabled || !config.apiKey?.trim()}
                        onClick={onClearApiKey}
                    >
                        Clear
                    </button>
                </div>
            </label>
            <div className="inline-field-row">
                <label>
                    Model
                    <select
                        value={selectedModelValue}
                        onInput={(event) =>
                            updateSelectedModel(
                                (event.currentTarget as HTMLSelectElement).value,
                            )
                        }
                    >
                        {!config.model.id && (
                            <option value="api:">Load models and choose one</option>
                        )}
                        {config.model.id && !selectedModelIsLoaded && (
                            <option value={`api:${config.model.id}`}>
                                {config.model.id}
                            </option>
                        )}
                        {config.model.id &&
                            selectedModelIsLoaded &&
                            !selectedModelIsVisible && (
                                <option value={`api:${config.model.id}`}>
                                    {modelLabel(selectedModel)}
                                </option>
                            )}
                        {models.length === 0 && (
                            <option disabled value="api:">
                                Load required
                            </option>
                        )}
                        {models.length > 0 && filteredModels.length === 0 && (
                            <option disabled value="api:">
                                No matching models
                            </option>
                        )}
                        {filteredModels.map((model) => (
                            <option key={model.id} value={`api:${model.id}`}>
                                {modelLabel(model)}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="button" disabled={disabled} onClick={onLoadModels}>
                    Load
                </button>
            </div>
            <label>
                Search models
                <input
                    value={modelSearch}
                    placeholder="Filter loaded OpenRouter models"
                    disabled={models.length === 0}
                    onInput={(event) =>
                        setModelSearch((event.currentTarget as HTMLInputElement).value)
                    }
                />
            </label>
            {selectedModel && (
                <dl className="openrouter-model-meta">
                    <div>
                        <dt>Context</dt>
                        <dd>
                            {selectedModel.context_length?.toLocaleString() ??
                                selectedModel.top_provider?.context_length?.toLocaleString() ??
                                "Unknown"}
                        </dd>
                    </div>
                    <div>
                        <dt>Prompt</dt>
                        <dd>{selectedModel.pricing?.prompt ?? "Unknown"}</dd>
                    </div>
                    <div>
                        <dt>Completion</dt>
                        <dd>{selectedModel.pricing?.completion ?? "Unknown"}</dd>
                    </div>
                </dl>
            )}
            <div className="connection-card">
                <h4>Routing</h4>
                <label>
                    Routing priority
                    <select
                        value={preferences.sort ?? ""}
                        onInput={(event) =>
                            updateProviderPreferences({
                                sort: normalizeSort(
                                    (event.currentTarget as HTMLSelectElement).value,
                                ),
                            })
                        }
                    >
                        <option value="">Balanced default</option>
                        <option value="price">Cheapest</option>
                        <option value="throughput">Fastest output</option>
                        <option value="latency">Lowest latency</option>
                    </select>
                </label>
                <div className="preset-toggle-row">
                    <label>
                        <input
                            type="checkbox"
                            checked={preferences.allow_fallbacks !== false}
                            onInput={(event) =>
                                updateProviderPreferences({
                                    allow_fallbacks: (
                                        event.currentTarget as HTMLInputElement
                                    ).checked,
                                })
                            }
                        />
                        Allow provider fallbacks
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={preferences.require_parameters === true}
                            onInput={(event) =>
                                updateProviderPreferences({
                                    require_parameters: (
                                        event.currentTarget as HTMLInputElement
                                    ).checked,
                                })
                            }
                        />
                        Require full parameter support
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={preferences.zdr === true}
                            onInput={(event) =>
                                updateProviderPreferences({
                                    zdr: (event.currentTarget as HTMLInputElement)
                                        .checked,
                                })
                            }
                        />
                        Require Zero Data Retention
                    </label>
                </div>
                <label>
                    Data collection
                    <select
                        value={preferences.data_collection ?? "allow"}
                        onInput={(event) =>
                            updateProviderPreferences({
                                data_collection: (
                                    event.currentTarget as HTMLSelectElement
                                ).value as "allow" | "deny",
                            })
                        }
                    >
                        <option value="allow">Allow provider policy default</option>
                        <option value="deny">Deny data-collecting providers</option>
                    </select>
                </label>
                <div className="connection-field-grid">
                    <label>
                        Preferred providers
                        <textarea
                            rows={2}
                            value={formatOpenRouterSlugList(preferences.order)}
                            placeholder="anthropic, openai, deepinfra/turbo"
                            onInput={(event) =>
                                updateProviderPreferences({
                                    order: parseOpenRouterSlugList(
                                        (event.currentTarget as HTMLTextAreaElement)
                                            .value,
                                    ),
                                })
                            }
                        />
                    </label>
                    <label>
                        Only providers
                        <textarea
                            rows={2}
                            value={formatOpenRouterSlugList(preferences.only)}
                            placeholder="Optional allowlist"
                            onInput={(event) =>
                                updateProviderPreferences({
                                    only: parseOpenRouterSlugList(
                                        (event.currentTarget as HTMLTextAreaElement)
                                            .value,
                                    ),
                                })
                            }
                        />
                    </label>
                    <label>
                        Ignored providers
                        <textarea
                            rows={2}
                            value={formatOpenRouterSlugList(preferences.ignore)}
                            placeholder="Optional blocklist"
                            onInput={(event) =>
                                updateProviderPreferences({
                                    ignore: parseOpenRouterSlugList(
                                        (event.currentTarget as HTMLTextAreaElement)
                                            .value,
                                    ),
                                })
                            }
                        />
                    </label>
                </div>
            </div>
            <div className="connection-actions">
                <button type="button" disabled={disabled} onClick={onSave}>
                    Save
                </button>
                <button type="button" disabled={disabled} onClick={onTest}>
                    Test connection
                </button>
            </div>
        </section>
    );
}

function normalizeSort(value: string): OpenRouterSort | undefined {
    return value === "price" || value === "throughput" || value === "latency"
        ? value
        : undefined;
}

function filterModels(models: OpenRouterModel[], search: string) {
    const query = search.trim().toLowerCase();

    if (!query) {
        return models;
    }

    return models.filter((model) =>
        [model.id, model.name, model.description]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(query)),
    );
}

function modelLabel(model: OpenRouterModel | undefined) {
    if (!model) {
        return "";
    }

    return model.name ? `${model.name} (${model.id})` : model.id;
}
