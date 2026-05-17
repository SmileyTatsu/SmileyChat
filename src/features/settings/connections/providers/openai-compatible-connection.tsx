import defaultModelCategories from "#frontend/data/default-openai-models.json";
import type {
    OpenAICompatibleConnectionConfig,
    OpenAICompatibleModel,
    OpenAICompatibleReasoningConfig,
} from "#frontend/lib/connections/openai-compatible/types";

import {
    ApiKeyField,
    BaseUrlField,
    CatalogModelField,
    ConnectionActions,
} from "./shared-fields";

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

    function updateReasoning(nextReasoning: OpenAICompatibleReasoningConfig | undefined) {
        updateConfig({ reasoning: nextReasoning });
    }

    function setReasoningEnabled(enabled: boolean) {
        if (!enabled) {
            updateReasoning(undefined);
            return;
        }

        updateReasoning({
            enabled: true,
            effort: config.reasoning?.effort ?? "medium",
            wireFormat: config.reasoning?.wireFormat ?? "chat-reasoning-effort",
        });
    }

    function updateReasoningPatch(
        nextReasoning: Partial<OpenAICompatibleReasoningConfig>,
    ) {
        updateReasoning({
            enabled: true,
            effort: config.reasoning?.effort ?? "medium",
            wireFormat: config.reasoning?.wireFormat ?? "chat-reasoning-effort",
            ...nextReasoning,
        });
    }

    const reasoning = config.reasoning;
    const reasoningEnabled = reasoning?.enabled === true;

    return (
        <section className="connection-provider-panel">
            <h3>OpenAI compatible</h3>
            <BaseUrlField
                baseUrl={config.baseUrl}
                placeholder="https://api.openai.com/v1"
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
                getApiModelLabel={(model) => model.id}
            />
            <div className="connection-card">
                <h4>Reasoning / Thinking Tokens</h4>
                <div className="preset-toggle-row">
                    <label>
                        <input
                            type="checkbox"
                            checked={reasoningEnabled}
                            onInput={(event) =>
                                setReasoningEnabled(
                                    (event.currentTarget as HTMLInputElement).checked,
                                )
                            }
                        />
                        Enable reasoning controls
                    </label>
                </div>
                <div className="connection-field-grid">
                    <label>
                        Wire format
                        <select
                            value={reasoning?.wireFormat ?? "chat-reasoning-effort"}
                            disabled={!reasoningEnabled}
                            onInput={(event) =>
                                updateReasoningPatch({
                                    wireFormat: (event.currentTarget as HTMLSelectElement)
                                        .value as OpenAICompatibleReasoningConfig["wireFormat"],
                                })
                            }
                        >
                            <option value="chat-reasoning-effort">
                                Chat Completions: reasoning_effort
                            </option>
                            <option value="chat-reasoning-object">
                                Chat Completions: reasoning object
                            </option>
                        </select>
                    </label>
                    <label>
                        Effort level
                        <select
                            value={reasoning?.effort ?? "medium"}
                            disabled={!reasoningEnabled}
                            onInput={(event) =>
                                updateReasoningPatch({
                                    effort: (event.currentTarget as HTMLSelectElement)
                                        .value as OpenAICompatibleReasoningConfig["effort"],
                                })
                            }
                        >
                            <option value="none">None</option>
                            <option value="minimal">Minimal</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="xhigh">Extra high</option>
                        </select>
                    </label>
                </div>
            </div>
            <ConnectionActions disabled={disabled} onSave={onSave} onTest={onTest} />
        </section>
    );
}
