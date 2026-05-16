import defaultModelCategories from "#frontend/data/default-google-ai-models.json";
import type {
    GoogleAIConnectionConfig,
    GoogleAIModel,
    GoogleAIThinkingConfig,
} from "#frontend/lib/connections/google-ai/types";

import {
    ApiKeyField,
    BaseUrlField,
    CatalogModelField,
    ConnectionActions,
} from "./shared-fields";

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

    function updateThinking(nextThinking: Partial<GoogleAIThinkingConfig>) {
        updateConfig({
            thinking: {
                ...(config.thinking ?? {}),
                ...nextThinking,
            },
        });
    }

    return (
        <section className="connection-provider-panel">
            <h3>Google AI</h3>
            <BaseUrlField
                baseUrl={config.baseUrl}
                placeholder="https://generativelanguage.googleapis.com/v1beta"
                onChange={(baseUrl) => updateConfig({ baseUrl })}
            />
            <ApiKeyField
                apiKey={config.apiKey}
                disabled={disabled}
                onChange={(apiKey) => updateConfig({ apiKey })}
                onClear={onClearApiKey}
            />
            <CatalogModelField
                apiModels={models}
                defaultModelCategories={defaultModelCategories}
                disabled={disabled}
                model={config.model}
                onChange={(model) => updateConfig({ model })}
                onLoadModels={onLoadModels}
                getApiModelId={(model) => model.baseModelId ?? model.name}
                getApiModelLabel={modelLabel}
            />
            <fieldset className="connection-fieldset">
                <legend>Thinking</legend>
                <label className="checkbox-field">
                    <input
                        type="checkbox"
                        checked={config.thinking?.includeThoughts === true}
                        onInput={(event) =>
                            updateThinking({
                                includeThoughts: (event.currentTarget as HTMLInputElement)
                                    .checked,
                            })
                        }
                    />
                    Show thought summaries
                </label>
                <label>
                    Strategy
                    <select
                        value={config.thinking?.mode ?? "auto"}
                        onInput={(event) =>
                            updateThinking({
                                mode: (event.currentTarget as HTMLSelectElement)
                                    .value as GoogleAIThinkingConfig["mode"],
                            })
                        }
                    >
                        <option value="auto">Auto</option>
                        <option value="level">Gemini 3 level</option>
                        <option value="budget">Gemini 2.5 budget</option>
                    </select>
                </label>
                <label>
                    Thinking level
                    <select
                        value={config.thinking?.thinkingLevel ?? "low"}
                        disabled={(config.thinking?.mode ?? "auto") !== "level"}
                        onInput={(event) =>
                            updateThinking({
                                thinkingLevel: (event.currentTarget as HTMLSelectElement)
                                    .value as GoogleAIThinkingConfig["thinkingLevel"],
                            })
                        }
                    >
                        <option value="minimal">Minimal</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                </label>
                <label>
                    Thinking budget
                    <input
                        type="number"
                        step="1"
                        value={config.thinking?.thinkingBudget ?? -1}
                        disabled={(config.thinking?.mode ?? "auto") !== "budget"}
                        onInput={(event) => {
                            const value = Number(
                                (event.currentTarget as HTMLInputElement).value,
                            );
                            updateThinking({
                                thinkingBudget:
                                    Number.isInteger(value) &&
                                    (value === -1 || value >= 0)
                                        ? value
                                        : undefined,
                            });
                        }}
                    />
                </label>
            </fieldset>
            <ConnectionActions disabled={disabled} onSave={onSave} onTest={onTest} />
        </section>
    );
}

function modelLabel(model: GoogleAIModel) {
    const id = model.baseModelId ?? model.name;
    return model.displayName ? `${model.displayName} (${id})` : id;
}
