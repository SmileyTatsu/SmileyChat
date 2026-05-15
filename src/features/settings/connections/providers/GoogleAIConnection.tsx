import defaultModelCategories from "../../../../data/defaultGoogleAIModels.json";
import type {
    GoogleAIConnectionConfig,
    GoogleAIModel,
} from "../../../../lib/connections/google-ai/types";

type GoogleAIConnectionProps = {
    config: GoogleAIConnectionConfig;
    disabled?: boolean;
    models: GoogleAIModel[];
    onChange: (config: GoogleAIConnectionConfig) => void;
    onClearApiKey: () => void;
    onLoadModels: () => void;
    onSave: () => void;
    onTest: () => void;
};

export function GoogleAIConnection({
    config,
    disabled,
    models,
    onChange,
    onClearApiKey,
    onLoadModels,
    onSave,
    onTest,
}: GoogleAIConnectionProps) {
    function updateConfig(nextConfig: Partial<GoogleAIConnectionConfig>) {
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
    const hasLoadedApiModels = models.length > 0;
    const savedApiModelId =
        !hasLoadedApiModels && config.model.source === "api" && config.model.id.length > 0
            ? config.model.id
            : null;

    return (
        <section className="connection-provider-panel">
            <h3>Google AI</h3>
            <label>
                Base URL
                <input
                    value={config.baseUrl}
                    placeholder="https://generativelanguage.googleapis.com/v1beta"
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
                        {hasLoadedApiModels ? (
                            <optgroup label="Loaded from API">
                                {models.map((model) => (
                                    <option
                                        key={model.name}
                                        value={`api:${model.baseModelId ?? model.name}`}
                                    >
                                        {modelLabel(model)}
                                    </option>
                                ))}
                            </optgroup>
                        ) : savedApiModelId ? (
                            <optgroup label="Loaded from API">
                                <option value={`api:${savedApiModelId}`}>
                                    {savedApiModelId}
                                </option>
                            </optgroup>
                        ) : (
                            <>
                                {defaultModelCategories.map((category) => (
                                    <optgroup key={category.id} label={category.label}>
                                        {category.models.map((model) => (
                                            <option
                                                key={model.id}
                                                value={`default:${model.id}`}
                                            >
                                                {model.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                                <optgroup label="Loaded from API">
                                    <option disabled value="api:">
                                        Load models to fill this category
                                    </option>
                                </optgroup>
                            </>
                        )}
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

function modelLabel(model: GoogleAIModel) {
    const id = model.baseModelId ?? model.name;
    return model.displayName ? `${model.displayName} (${id})` : id;
}
