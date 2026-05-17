import {
    claudeMaxModels,
    findClaudeMaxModel,
} from "#frontend/lib/connections/claude-max/models";
import type {
    ClaudeMaxConnectionConfig,
    ClaudeMaxThinkingMode,
} from "#frontend/lib/connections/claude-max/types";

import { ConnectionActions } from "./shared-fields";

type ClaudeMaxConnectionProps = {
    config: ClaudeMaxConnectionConfig;
    disabled?: boolean;
    onChange: (config: ClaudeMaxConnectionConfig) => void;
    onSave: () => void;
    onTest: () => void;
};

export function ClaudeMaxConnection({
    config,
    disabled,
    onChange,
    onSave,
    onTest,
}: ClaudeMaxConnectionProps) {
    const updateConfig = (patch: Partial<ClaudeMaxConnectionConfig>) => {
        onChange({ ...config, ...patch });
    };

    const selectedValue =
        config.model.source === "custom" ? "custom:" : `default:${config.model.id}`;
    const customId = config.model.source === "custom" ? config.model.id : "";

    const onModelChange = (value: string) => {
        const separatorIndex = value.indexOf(":");
        const source = value.slice(0, separatorIndex);
        const id = value.slice(separatorIndex + 1);

        if (source === "custom") {
            updateConfig({ model: { source: "custom", id: customId } });
            return;
        }

        const matched = findClaudeMaxModel(id);

        updateConfig({
            model: { source: "default", id },
            ...(matched
                ? {
                      contextWindow: matched.context,
                      maxOutputTokens: matched.maxOutput,
                  }
                : {}),
        });
    };

    const onCustomIdChange = (value: string) => {
        updateConfig({ model: { source: "custom", id: value } });
    };

    const onThinkingChange = (value: ClaudeMaxThinkingMode) => {
        updateConfig({ thinking: value });
    };

    const onContextWindowChange = (value: number) => {
        if (Number.isFinite(value) && value > 0) {
            updateConfig({ contextWindow: Math.trunc(value) });
        }
    };

    const onMaxOutputChange = (value: number) => {
        if (Number.isFinite(value) && value > 0) {
            updateConfig({ maxOutputTokens: Math.trunc(value) });
        }
    };

    return (
        <div className="connection-card">
            <p className="connection-help">
                Talks to Anthropic models through your Claude Pro or Max subscription. You
                need the official Claude Code CLI installed and logged in on this machine:
                run <code>npm i -g @anthropic-ai/claude-code</code> then{" "}
                <code>claude login</code>. No API key is sent from SmileyChat. Usage counts
                against your subscription quota.
            </p>

            <div className="inline-field-row">
                <label>
                    Model
                    <select
                        value={selectedValue}
                        disabled={disabled}
                        onInput={(event) =>
                            onModelChange(
                                (event.currentTarget as HTMLSelectElement).value,
                            )
                        }
                    >
                        <optgroup label="Anthropic">
                            {claudeMaxModels.map((model) => (
                                <option key={model.id} value={`default:${model.id}`}>
                                    {model.label}
                                </option>
                            ))}
                        </optgroup>
                        <option value="custom:">Custom model...</option>
                    </select>
                </label>
            </div>

            <label>
                Custom model
                <input
                    disabled={config.model.source !== "custom" || disabled}
                    value={customId}
                    placeholder="Use when targeting a model that is not listed"
                    onInput={(event) =>
                        onCustomIdChange(
                            (event.currentTarget as HTMLInputElement).value,
                        )
                    }
                />
            </label>

            <div className="inline-field-row">
                <label>
                    Context window (tokens)
                    <input
                        type="number"
                        min={1}
                        step={1000}
                        value={config.contextWindow}
                        disabled={disabled}
                        onInput={(event) => {
                            const next = (event.currentTarget as HTMLInputElement)
                                .valueAsNumber;

                            if (Number.isFinite(next)) {
                                onContextWindowChange(next);
                            }
                        }}
                    />
                </label>
                <label>
                    Max output (tokens)
                    <input
                        type="number"
                        min={1}
                        step={1000}
                        value={config.maxOutputTokens}
                        disabled={disabled}
                        onInput={(event) => {
                            const next = (event.currentTarget as HTMLInputElement)
                                .valueAsNumber;

                            if (Number.isFinite(next)) {
                                onMaxOutputChange(next);
                            }
                        }}
                    />
                </label>
            </div>

            <label>
                Extended thinking
                <select
                    value={config.thinking}
                    disabled={disabled}
                    onInput={(event) =>
                        onThinkingChange(
                            (event.currentTarget as HTMLSelectElement)
                                .value as ClaudeMaxThinkingMode,
                        )
                    }
                >
                    <option value="adaptive">
                        Adaptive (Opus 4.7+ only; the SDK ignores this on other models)
                    </option>
                    <option value="off">Off</option>
                </select>
            </label>

            <ConnectionActions disabled={disabled} onSave={onSave} onTest={onTest} />
        </div>
    );
}
