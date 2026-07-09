import defaultModelCategories from "#frontend/data/default-xai-models.json";
import type {
    XAIConnectionConfig,
    XAIModel,
    XAIReasoningConfig,
} from "#frontend/lib/connections/xai/types";

import {
    ApiKeyField,
    BaseUrlField,
    CatalogModelField,
    ConnectionActions,
} from "./shared-fields";

type XAIConnectionProps = {
    config: XAIConnectionConfig;
    disabled?: boolean;
    models: XAIModel[];
    onChange: (config: XAIConnectionConfig) => void;
    onClearApiKey: () => void;
    onLoadModels: () => void;
    onTest: () => void;
};

export function XAIConnection({
    config,
    disabled,
    models,
    onChange,
    onClearApiKey,
    onLoadModels,
    onTest,
}: XAIConnectionProps) {
    const reasoning = config.reasoning;
    const reasoningEnabled = reasoning?.enabled === true;
    const selectedModel = models.find((model) => model.id === config.model.id);

    function updateConfig(nextConfig: Partial<XAIConnectionConfig>) {
        onChange({ ...config, ...nextConfig });
    }

    function updateReasoningEnabled(enabled: boolean) {
        updateConfig({
            reasoning: enabled
                ? {
                      enabled: true,
                      effort: reasoning?.enabled === true ? reasoning.effort : undefined,
                  }
                : undefined,
        });
    }

    function updateReasoningEffort(
        effort: Extract<XAIReasoningConfig, { enabled: true }>["effort"] | "",
    ) {
        updateConfig({
            reasoning: {
                enabled: true,
                ...(effort ? { effort } : {}),
            },
        });
    }

    return (
        <section className="connection-provider-panel">
            <h3>xAI</h3>
            <BaseUrlField
                baseUrl={config.baseUrl}
                placeholder="https://api.x.ai/v1"
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
                getApiModelId={(model) => model.id}
                getApiModelLabel={modelLabel}
            />
            <label>
                Max completion tokens
                <input
                    type="number"
                    min={16}
                    step={1}
                    value={config.maxCompletionTokens ?? 1000}
                    onInput={(event) =>
                        updateConfig({
                            maxCompletionTokens: Math.max(
                                16,
                                Math.floor(
                                    Number(
                                        (event.currentTarget as HTMLInputElement).value,
                                    ) || 16,
                                ),
                            ),
                        })
                    }
                />
            </label>
            {selectedModel && (
                <dl className="openrouter-model-meta">
                    <div>
                        <dt>Context</dt>
                        <dd>
                            {selectedModel.context_length?.toLocaleString() ?? "Unknown"}
                        </dd>
                    </div>
                    <div>
                        <dt>Owner</dt>
                        <dd>{selectedModel.owned_by || "Unknown"}</dd>
                    </div>
                    <div>
                        <dt>Aliases</dt>
                        <dd>{selectedModel.aliases?.length ? "Yes" : "None"}</dd>
                    </div>
                </dl>
            )}
            <div className="connection-card">
                <h4>Reasoning</h4>
                <label className="checkbox-field">
                    <input
                        type="checkbox"
                        checked={reasoningEnabled}
                        onChange={(event) =>
                            updateReasoningEnabled(
                                (event.currentTarget as HTMLInputElement).checked,
                            )
                        }
                    />
                    Use xAI reasoning effort
                </label>
                <label>
                    Effort
                    <select
                        disabled={!reasoningEnabled}
                        value={reasoningEnabled ? (reasoning.effort ?? "") : ""}
                        onInput={(event) =>
                            updateReasoningEffort(
                                (event.currentTarget as HTMLSelectElement).value as
                                    | Extract<
                                          XAIReasoningConfig,
                                          { enabled: true }
                                      >["effort"]
                                    | "",
                            )
                        }
                    >
                        <option value="">Provider default</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                </label>
                <p className="field-hint">
                    xAI reasoning models reject presence penalty, frequency penalty, and
                    stop sequences when reasoning effort is active.
                </p>
            </div>
            <ConnectionActions disabled={disabled} onTest={onTest} />
        </section>
    );
}

function modelLabel(model: XAIModel) {
    return model.aliases?.length ? `${model.id} (${model.aliases.join(", ")})` : model.id;
}
