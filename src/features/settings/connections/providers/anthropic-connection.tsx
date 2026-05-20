import defaultModelCategories from "#frontend/data/default-anthropic-models.json";
import type {
    AnthropicConnectionConfig,
    AnthropicModel,
    AnthropicThinkingConfig,
} from "#frontend/lib/connections/anthropic/types";

import {
    ApiKeyField,
    BaseUrlField,
    CatalogModelField,
    ConnectionActions,
} from "./shared-fields";

type AnthropicConnectionProps = {
    config: AnthropicConnectionConfig;
    disabled?: boolean;
    models: AnthropicModel[];
    onChange: (config: AnthropicConnectionConfig) => void;
    onClearApiKey: () => void;
    onLoadModels: () => void;
    onTest: () => void;
};

type ThinkingMode = AnthropicThinkingConfig["mode"];

export function AnthropicConnection({
    config,
    disabled,
    models,
    onChange,
    onClearApiKey,
    onLoadModels,
    onTest,
}: AnthropicConnectionProps) {
    const thinking = config.thinking ?? { mode: "off" as const };

    function updateConfig(nextConfig: Partial<AnthropicConnectionConfig>) {
        onChange({ ...config, ...nextConfig });
    }

    function updateThinkingMode(mode: ThinkingMode) {
        if (mode === "adaptive") {
            updateConfig({
                thinking: {
                    mode,
                    effort: thinking.mode === "adaptive" ? thinking.effort : "medium",
                    display: thinking.mode !== "off" ? thinking.display : "summarized",
                },
            });
            return;
        }

        if (mode === "enabled") {
            updateConfig({
                thinking: {
                    mode,
                    budgetTokens:
                        thinking.mode === "enabled" ? thinking.budgetTokens : 512,
                    display: thinking.mode !== "off" ? thinking.display : "summarized",
                },
            });
            return;
        }

        updateConfig({ thinking: { mode: "off" } });
    }

    function updateAdaptiveThinking(
        nextThinking: Partial<Extract<AnthropicThinkingConfig, { mode: "adaptive" }>>,
    ) {
        updateConfig({
            thinking: {
                mode: "adaptive",
                ...(thinking.mode === "adaptive" ? thinking : {}),
                ...nextThinking,
            },
        });
    }

    function updateEnabledThinking(
        nextThinking: Partial<Extract<AnthropicThinkingConfig, { mode: "enabled" }>>,
    ) {
        updateConfig({
            thinking: {
                mode: "enabled",
                ...(thinking.mode === "enabled" ? thinking : {}),
                ...nextThinking,
            },
        });
    }

    const selectedModel = models.find((model) => model.id === config.model.id);

    return (
        <section className="connection-provider-panel">
            <h3>Anthropic</h3>
            <BaseUrlField
                baseUrl={config.baseUrl}
                placeholder="https://api.anthropic.com/v1"
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
                Max tokens
                <input
                    type="number"
                    min={0}
                    step={1}
                    value={config.maxTokens ?? 1000}
                    onInput={(event) =>
                        updateConfig({
                            maxTokens: Math.max(
                                0,
                                Math.floor(
                                    Number(
                                        (event.currentTarget as HTMLInputElement).value,
                                    ) || 0,
                                ),
                            ),
                        })
                    }
                />
            </label>
            {selectedModel && (
                <dl className="openrouter-model-meta">
                    <div>
                        <dt>Input</dt>
                        <dd>
                            {selectedModel.max_input_tokens?.toLocaleString() ??
                                "Unknown"}
                        </dd>
                    </div>
                    <div>
                        <dt>Output</dt>
                        <dd>{selectedModel.max_tokens?.toLocaleString() ?? "Unknown"}</dd>
                    </div>
                    <div>
                        <dt>Thinking</dt>
                        <dd>{thinkingSupportLabel(selectedModel)}</dd>
                    </div>
                </dl>
            )}
            <div className="connection-card">
                <h4>Thinking</h4>
                <label>
                    Mode
                    <select
                        value={thinking.mode}
                        onInput={(event) =>
                            updateThinkingMode(
                                (event.currentTarget as HTMLSelectElement)
                                    .value as ThinkingMode,
                            )
                        }
                    >
                        <option value="off">Off</option>
                        <option value="adaptive">Adaptive</option>
                        <option value="enabled">Manual token budget</option>
                    </select>
                </label>
                <div className="connection-field-grid">
                    <label>
                        Effort
                        <select
                            value={
                                thinking.mode === "adaptive"
                                    ? (thinking.effort ?? "medium")
                                    : "medium"
                            }
                            disabled={thinking.mode !== "adaptive"}
                            onInput={(event) =>
                                updateAdaptiveThinking({
                                    effort: (event.currentTarget as HTMLSelectElement)
                                        .value as Extract<
                                        AnthropicThinkingConfig,
                                        { mode: "adaptive" }
                                    >["effort"],
                                })
                            }
                        >
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="xhigh">Extra high</option>
                            <option value="max">Max</option>
                        </select>
                    </label>
                    <label>
                        Budget tokens
                        <input
                            type="number"
                            min={1}
                            step={1}
                            value={
                                thinking.mode === "enabled"
                                    ? (thinking.budgetTokens ?? 512)
                                    : 512
                            }
                            disabled={thinking.mode !== "enabled"}
                            onInput={(event) =>
                                updateEnabledThinking({
                                    budgetTokens: Math.max(
                                        1,
                                        Math.floor(
                                            Number(
                                                (event.currentTarget as HTMLInputElement)
                                                    .value,
                                            ) || 1,
                                        ),
                                    ),
                                })
                            }
                        />
                    </label>
                </div>
                <label>
                    Display
                    <select
                        value={
                            thinking.mode !== "off"
                                ? (thinking.display ?? "summarized")
                                : "summarized"
                        }
                        disabled={thinking.mode === "off"}
                        onInput={(event) => {
                            const display = (event.currentTarget as HTMLSelectElement)
                                .value as "summarized" | "omitted";

                            if (thinking.mode === "adaptive") {
                                updateAdaptiveThinking({ display });
                            } else if (thinking.mode === "enabled") {
                                updateEnabledThinking({ display });
                            }
                        }}
                    >
                        <option value="summarized">Show summary</option>
                        <option value="omitted">Omit from stream</option>
                    </select>
                </label>
                <p className="field-hint">
                    Manual token budgets are rejected by Claude Opus 4.7. Use adaptive
                    thinking for current Opus and Sonnet models.
                </p>
            </div>
            <ConnectionActions disabled={disabled} onTest={onTest} />
        </section>
    );
}

function modelLabel(model: AnthropicModel) {
    return model.display_name ? `${model.display_name} (${model.id})` : model.id;
}

function thinkingSupportLabel(model: AnthropicModel) {
    const adaptive = model.capabilities?.thinking?.adaptive?.supported;
    const enabled = model.capabilities?.thinking?.enabled?.supported;

    if (adaptive && enabled) {
        return "Adaptive, manual";
    }

    if (adaptive) {
        return "Adaptive";
    }

    if (enabled) {
        return "Manual";
    }

    return "Unknown";
}
