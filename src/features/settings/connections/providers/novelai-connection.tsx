import {
    defaultNovelAIBaseUrlForModel,
    novelAIDefaultModels,
} from "#frontend/lib/connections/novelai/constants";
import type { NovelAIConnectionConfig } from "#frontend/lib/connections/novelai/types";

import { ApiKeyField, BaseUrlField, ConnectionActions } from "./shared-fields";

type NovelAIConnectionProps = {
    config: NovelAIConnectionConfig;
    disabled?: boolean;
    onChange: (config: NovelAIConnectionConfig) => void;
    onClearApiKey: () => void;
    onTest: () => void;
};

export function NovelAIConnection({
    config,
    disabled,
    onChange,
    onClearApiKey,
    onTest,
}: NovelAIConnectionProps) {
    function updateConfig(nextConfig: Partial<NovelAIConnectionConfig>) {
        onChange({ ...config, ...nextConfig });
    }

    function updateModel(value: string) {
        if (value === "custom") {
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
                id: value,
            },
        });
    }

    function updateCustomModel(id: string) {
        updateConfig({
            model: {
                source: "custom",
                id,
            },
        });
    }

    const selectedModelValue =
        config.model.source === "custom" ? "custom" : config.model.id;
    const routedBaseUrl = defaultNovelAIBaseUrlForModel(config.model.id);

    return (
        <section className="connection-provider-panel">
            <h3>NovelAI</h3>
            <ApiKeyField
                apiKey={config.apiKey}
                disabled={disabled}
                onChange={(apiKey) => updateConfig({ apiKey })}
                onClear={onClearApiKey}
            />
            <label>
                Model
                <select
                    value={selectedModelValue}
                    disabled={disabled}
                    onInput={(event) =>
                        updateModel((event.currentTarget as HTMLSelectElement).value)
                    }
                >
                    {novelAIDefaultModels.map((model) => (
                        <option key={model.id} value={model.id}>
                            {model.label} ({model.id})
                        </option>
                    ))}
                    <option value="custom">Custom model...</option>
                </select>
            </label>
            <label>
                Custom model
                <input
                    disabled={disabled || config.model.source !== "custom"}
                    value={config.model.source === "custom" ? config.model.id : ""}
                    placeholder="Use a NovelAI model ID"
                    onInput={(event) =>
                        updateCustomModel((event.currentTarget as HTMLInputElement).value)
                    }
                />
            </label>
            <label>
                Max output tokens
                <input
                    min={1}
                    step={1}
                    type="number"
                    value={config.maxOutputTokens ?? 1000}
                    onInput={(event) =>
                        updateConfig({
                            maxOutputTokens: Math.max(
                                1,
                                Math.floor(
                                    Number(
                                        (event.currentTarget as HTMLInputElement).value,
                                    ) || 1,
                                ),
                            ),
                        })
                    }
                />
            </label>
            <details>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Advanced</summary>
                <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
                    <BaseUrlField
                        baseUrl={config.baseUrl ?? ""}
                        placeholder={routedBaseUrl}
                        onChange={(baseUrl) =>
                            updateConfig({
                                baseUrl: baseUrl || undefined,
                            })
                        }
                    />
                    <p className="field-hint">
                        Leave blank to use text.novelai.net. Erato and Kayra use NovelAI's
                        text generation API; Xiaolong, GLM, and custom models use the
                        OpenAI-compatible chat endpoint.
                    </p>
                </div>
            </details>
            <ConnectionActions disabled={disabled} onTest={onTest} />
        </section>
    );
}
