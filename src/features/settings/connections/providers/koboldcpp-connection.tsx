import { DeferredNumberInput } from "#frontend/features/settings/deferred-number-input";
import { instructTemplateLabels, type InstructTemplateId } from "#frontend/lib/instruct";
import type { KoboldCPPConnectionConfig } from "#frontend/lib/connections/koboldcpp/types";
import { ConnectionActions } from "./shared-fields";

type KoboldCPPConnectionProps = {
    config: KoboldCPPConnectionConfig;
    disabled?: boolean;
    onChange: (config: KoboldCPPConnectionConfig) => void;
    onTest: () => void;
    onConnect: () => void;
};

export function KoboldCPPConnection({
    config,
    disabled,
    onChange,
    onTest,
    onConnect,
}: KoboldCPPConnectionProps) {
    function updateConfig(patch: Partial<KoboldCPPConnectionConfig>) {
        onChange({ ...config, ...patch });
    }

    return (
        <section className="connection-provider-panel">
            <h3>KoboldCPP</h3>
            <p className="field-hint">
                Formats SmileyChat’s unified messages locally, then sends the prompt
                directly to KoboldCPP.
            </p>

            <div className="inline-field-row">
                <label>
                    Base URL
                    <input
                        value={config.baseUrl}
                        placeholder="http://localhost:5001/api"
                        onInput={(event) =>
                            updateConfig({ baseUrl: event.currentTarget.value })
                        }
                    />
                </label>
                <button type="button" disabled={disabled} onClick={onConnect}>
                    Connect
                </button>
            </div>

            <label>
                Loaded model
                <input
                    readOnly
                    value={config.model.id || ""}
                    placeholder="Click Connect to inspect your KoboldCPP server"
                />
            </label>

            <label>
                Instruct template
                <select
                    value={config.instructTemplate}
                    onInput={(event) =>
                        updateConfig({
                            instructTemplate: event.currentTarget
                                .value as InstructTemplateId,
                        })
                    }
                >
                    {Object.entries(instructTemplateLabels).map(([id, label]) => (
                        <option key={id} value={id}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>

            <div className="connection-field-grid">
                <label>
                    Max output tokens
                    <DeferredNumberInput
                        min={1}
                        integer
                        value={config.maxOutputTokens}
                        onCommit={(maxOutputTokens) => updateConfig({ maxOutputTokens })}
                    />
                </label>
                <label>
                    Detected context length
                    <DeferredNumberInput
                        min={1}
                        integer
                        optional
                        value={config.maxContextLength}
                        onCommit={(maxContextLength) =>
                            updateConfig({ maxContextLength })
                        }
                    />
                </label>
            </div>

            <ConnectionActions disabled={disabled} onTest={onTest} />
        </section>
    );
}
