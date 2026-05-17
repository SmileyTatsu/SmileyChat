import type { ComponentChildren } from "preact";

import type { ConnectionProfile } from "#frontend/lib/connections/config";

import { normalizeClaudeMaxConfig } from "./config";
import { claudeMaxModels, findClaudeMaxModel } from "./models";
import type { ClaudeMaxConfig, ClaudeMaxThinkingMode } from "./types";

type ClaudeMaxSettingsProps = {
    profile: ConnectionProfile;
    disabled?: boolean;
    onChange: (config: Record<string, unknown>) => void;
    onSave: () => void | Promise<void>;
    onTest: () => void | Promise<void>;
};

export function renderClaudeMaxSettings({
    profile,
    disabled,
    onChange,
    onSave,
    onTest,
}: ClaudeMaxSettingsProps): ComponentChildren {
    const config = normalizeClaudeMaxConfig(profile.config);

    const updateConfig = (patch: Partial<ClaudeMaxConfig>) => {
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

        updateConfig({ model: { source: "default", id } });
    };

    const onCustomIdChange = (value: string) => {
        updateConfig({ model: { source: "custom", id: value } });
    };

    const onThinkingChange = (value: ClaudeMaxThinkingMode) => {
        updateConfig({ thinking: value });
    };

    const onFastModeChange = (checked: boolean) => {
        updateConfig({ fastMode: checked });
    };

    const matchedModel = findClaudeMaxModel(config.model.id);

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

            {matchedModel && (
                <p className="connection-help">
                    Context window: {matchedModel.context.toLocaleString()} tokens. Max
                    output: {matchedModel.maxOutput.toLocaleString()} tokens.
                </p>
            )}

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

            <label className="claude-max-toggle-row">
                <input
                    type="checkbox"
                    checked={config.fastMode}
                    disabled={disabled}
                    onChange={(event) =>
                        onFastModeChange(
                            (event.currentTarget as HTMLInputElement).checked,
                        )
                    }
                />
                <span>
                    Fast Mode (claude --fast)
                    <small>
                        Asks the CLI to skip optional thinking and tool steps for
                        snappier replies. The setting is forwarded to the SDK and only
                        takes effect on CLI versions that honor it.
                    </small>
                </span>
            </label>

            <div className="connection-actions">
                <button type="button" disabled={disabled} onClick={() => void onSave()}>
                    Save
                </button>
                <button type="button" disabled={disabled} onClick={() => void onTest()}>
                    Test connection
                </button>
            </div>
        </div>
    );
}
