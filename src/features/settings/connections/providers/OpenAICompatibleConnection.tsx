import defaultModelCategories from "../../../../data/defaultOpenAIModels.json";
import type {
    OpenAICompatibleConnectionConfig,
    OpenAICompatibleModel,
} from "../../../../lib/connections/openai-compatible/types";

type OpenAICompatibleConnectionProps = {
    config: OpenAICompatibleConnectionConfig;
    disabled?: boolean;
    models: OpenAICompatibleModel[];
    onChange: (config: OpenAICompatibleConnectionConfig) => void;
    onClearApiKey: () => void;
    onLoadModels: () => void;
    onSave: () => void;
    onTest: () => void;
};

export function OpenAICompatibleConnection({
    config,
    disabled,
    models,
    onChange,
    onClearApiKey,
    onLoadModels,
    onSave,
    onTest,
}: OpenAICompatibleConnectionProps) {
    function updateConfig(nextConfig: Partial<OpenAICompatibleConnectionConfig>) {
        onChange({ ...config, ...nextConfig });
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

        if (source === "custom") {
            updateConfig({
                model: {
                    source: "custom",
                    id: config.model.source === "custom" ? config.model.id : "",
                },
            });
            return;
        }

        updateConfig({
            model: {
                source: "default",
                id,
            },
        });
    }

    const selectedModelValue =
        config.model.source === "custom"
            ? "custom:"
            : `${config.model.source}:${config.model.id}`;
    const selectedApiModelIsLoaded =
        config.model.source !== "api" ||
        models.some((model) => model.id === config.model.id);

    return (
        <section className="connection-provider-panel">
            <h3>OpenAI compatible</h3>
            <label>
                Base URL
                <input
                    value={config.baseUrl}
                    placeholder="https://api.openai.com/v1"
                    onInput={(event) =>
                        updateConfig({
                            baseUrl: (event.currentTarget as HTMLInputElement).value,
                        })
                    }
                />
            </label>
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
                        {defaultModelCategories.map((category) => (
                            <optgroup key={category.id} label={category.label}>
                                {category.models.map((model) => (
                                    <option key={model.id} value={`default:${model.id}`}>
                                        {model.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        <optgroup label="Other">
                            {!selectedApiModelIsLoaded && (
                                <option value={`api:${config.model.id}`}>
                                    {config.model.id}
                                </option>
                            )}
                            {models.length === 0 && (
                                <option disabled value="api:">
                                    Load models to fill this category
                                </option>
                            )}
                            {models.map((model) => (
                                <option key={model.id} value={`api:${model.id}`}>
                                    {model.id}
                                </option>
                            ))}
                        </optgroup>
                        <option value="custom:">Custom model...</option>
                    </select>
                </label>
                <button type="button" disabled={disabled} onClick={onLoadModels}>
                    Load
                </button>
            </div>
            <label>
                Custom model
                <input
                    disabled={config.model.source !== "custom"}
                    value={config.model.source === "custom" ? config.model.id : ""}
                    placeholder="Use when the endpoint does not list models"
                    onInput={(event) =>
                        updateConfig({
                            model: {
                                source: "custom",
                                id: (event.currentTarget as HTMLInputElement).value,
                            },
                        })
                    }
                />
            </label>
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
