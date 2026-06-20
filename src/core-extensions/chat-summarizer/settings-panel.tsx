import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

import type { SmileyPluginApi, PluginAppSnapshot } from "#frontend/lib/plugins/types";

import { getSummarizerSettings, saveSummarizerSettings } from "./daemon";
import {
    defaultInjectionTemplate,
    defaultSystemInstruction,
    defaultUserPromptTemplate,
    type SummarizerSettings,
} from "./settings";

type SettingsPanelProps = {
    api: SmileyPluginApi;
    snapshot: PluginAppSnapshot;
};

export function SummarizerSettingsPanel({ api, snapshot }: SettingsPanelProps) {
    const [settings, setSettings] = useState(getSummarizerSettings());
    const [status, setStatus] = useState("");

    async function update(patch: Partial<SummarizerSettings>) {
        const nextSettings = await saveSummarizerSettings(api, patch);
        setSettings(nextSettings);
        setStatus("Saved.");
    }

    const profiles = snapshot.connectionSettings.profiles;
    const presets = snapshot.presetCollection.presets;

    return (
        <section className="chs-settings">
            <div className="chs-note">
                Background summarization sends selected chat messages to the configured
                model profile. Keep automation off if summaries should only run manually.
            </div>

            <section className="chs-settings-group">
                <h5>Automation</h5>
                <Field label="Trigger mode">
                    <select
                        value={settings.triggerMode}
                        onChange={(event) =>
                            void update({
                                triggerMode: event.currentTarget.value as
                                    | "manual"
                                    | "message-count",
                            })
                        }
                    >
                        <option value="manual">Manual only</option>
                        <option value="message-count">Every X messages</option>
                    </select>
                </Field>
                <Field label="Message threshold">
                    <input
                        min={1}
                        max={1000}
                        type="number"
                        value={settings.triggerThreshold}
                        onInput={(event) =>
                            void update({
                                triggerThreshold: Number(event.currentTarget.value),
                            })
                        }
                    />
                </Field>
                <Field label="Daemon debounce (ms)">
                    <input
                        min={250}
                        max={30000}
                        step={250}
                        type="number"
                        value={settings.debounceMs}
                        onInput={(event) =>
                            void update({ debounceMs: Number(event.currentTarget.value) })
                        }
                    />
                </Field>
            </section>

            <section className="chs-settings-group">
                <h5>Background Model</h5>
                <Field label="Connection profile">
                    <select
                        value={settings.profileId}
                        onChange={(event) =>
                            void update({ profileId: event.currentTarget.value })
                        }
                    >
                        <option value="">Active profile</option>
                        {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.name || profile.id}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Generation preset">
                    <select
                        value={settings.presetId}
                        onChange={(event) =>
                            void update({ presetId: event.currentTarget.value })
                        }
                    >
                        <option value="">Active preset</option>
                        {presets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.title || preset.id}
                            </option>
                        ))}
                    </select>
                </Field>
                <Toggle
                    checked={settings.stream}
                    description="Streams the background request when the provider supports it."
                    label="Stream summarizer requests"
                    onChange={(stream) => void update({ stream })}
                />
            </section>

            <section className="chs-settings-group">
                <h5>Summary Scope</h5>
                <Toggle
                    checked={settings.includePreviousSummary}
                    description="Rolling summaries include the existing summary when updating."
                    label="Include previous summary"
                    onChange={(includePreviousSummary) =>
                        void update({ includePreviousSummary })
                    }
                />
                <Toggle
                    checked={settings.summarizeSystemMessages}
                    description="Includes visible system/plugin messages when they are prompt-eligible."
                    label="Summarize system messages"
                    onChange={(summarizeSystemMessages) =>
                        void update({ summarizeSystemMessages })
                    }
                />
                <Field label="Max messages per run">
                    <input
                        min={1}
                        max={1000}
                        type="number"
                        value={settings.maxMessagesPerRun}
                        onInput={(event) =>
                            void update({
                                maxMessagesPerRun: Number(event.currentTarget.value),
                            })
                        }
                    />
                </Field>
                <Field label="Max summary characters">
                    <input
                        min={500}
                        max={50000}
                        step={500}
                        type="number"
                        value={settings.maxSummaryCharacters}
                        onInput={(event) =>
                            void update({
                                maxSummaryCharacters: Number(event.currentTarget.value),
                            })
                        }
                    />
                </Field>
            </section>

            <section className="chs-settings-group wide">
                <h5>Summarization Prompt</h5>
                <Field label="System instruction">
                    <textarea
                        rows={8}
                        value={settings.systemInstruction}
                        onInput={(event) =>
                            void update({
                                systemInstruction: event.currentTarget.value,
                            })
                        }
                    />
                </Field>
                <Field label="User prompt template">
                    <textarea
                        rows={8}
                        value={settings.userPromptTemplate}
                        onInput={(event) =>
                            void update({
                                userPromptTemplate: event.currentTarget.value,
                            })
                        }
                    />
                </Field>
                <div className="chs-button-row">
                    <button
                        type="button"
                        onClick={() =>
                            void update({
                                systemInstruction: defaultSystemInstruction,
                                userPromptTemplate: defaultUserPromptTemplate,
                            })
                        }
                    >
                        Reset Prompt
                    </button>
                </div>
            </section>

            <section className="chs-settings-group">
                <h5>Prompt Injection</h5>
                <Toggle
                    checked={settings.injectionEnabled}
                    description="Adds the summary to generated chat prompts."
                    label="Inject summary"
                    onChange={(injectionEnabled) => void update({ injectionEnabled })}
                />
                <Field label="Injection role">
                    <select
                        value={settings.injectionRole}
                        onChange={(event) =>
                            void update({
                                injectionRole: event.currentTarget.value as
                                    | "system"
                                    | "developer",
                            })
                        }
                    >
                        <option value="system">System</option>
                        <option value="developer">Developer</option>
                    </select>
                </Field>
                <Field label="Depth">
                    <input
                        min={0}
                        max={100}
                        type="number"
                        value={settings.injectionDepth}
                        onInput={(event) =>
                            void update({
                                injectionDepth: Number(event.currentTarget.value),
                            })
                        }
                    />
                </Field>
                <Field label="Order">
                    <input
                        type="number"
                        value={settings.injectionOrder}
                        onInput={(event) =>
                            void update({
                                injectionOrder: Number(event.currentTarget.value),
                            })
                        }
                    />
                </Field>
                <Field label="Priority">
                    <input
                        type="number"
                        value={settings.injectionPriority}
                        onInput={(event) =>
                            void update({
                                injectionPriority: Number(event.currentTarget.value),
                            })
                        }
                    />
                </Field>
                <Field label="Budget behavior">
                    <select
                        value={settings.injectionTokenBudgetBehavior}
                        onChange={(event) =>
                            void update({
                                injectionTokenBudgetBehavior: event.currentTarget
                                    .value as "counted" | "ignore-budget",
                            })
                        }
                    >
                        <option value="counted">Counted</option>
                        <option value="ignore-budget">Ignore budget</option>
                    </select>
                </Field>
                <Field label="Injection template">
                    <textarea
                        rows={5}
                        value={settings.injectionTemplate}
                        onInput={(event) =>
                            void update({
                                injectionTemplate: event.currentTarget.value,
                            })
                        }
                    />
                </Field>
                <Toggle
                    checked={settings.macroEnabled}
                    description="Enables {{chat_summary}} for presets."
                    label="Enable summary macro"
                    onChange={(macroEnabled) => void update({ macroEnabled })}
                />
                <div className="chs-button-row">
                    <button
                        type="button"
                        onClick={() =>
                            void update({ injectionTemplate: defaultInjectionTemplate })
                        }
                    >
                        Reset Injection
                    </button>
                </div>
            </section>

            <p className="chs-status">{status}</p>
        </section>
    );
}

function Field({ children, label }: { children: ComponentChildren; label: string }) {
    return (
        <label className="chs-field">
            <span>{label}</span>
            {children}
        </label>
    );
}

function Toggle({
    checked,
    description,
    label,
    onChange,
}: {
    checked: boolean;
    description: string;
    label: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="chs-toggle">
            <span>
                {label}
                <small>{description}</small>
            </span>
            <input
                checked={checked}
                type="checkbox"
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
        </label>
    );
}
