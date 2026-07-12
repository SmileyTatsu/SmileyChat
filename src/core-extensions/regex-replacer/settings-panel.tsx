import { Plus, Trash2 } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import {
    createRegexRule,
    createRegexProfile,
    getRegexSettings,
    saveRegexSettings,
    type RegexRule,
    type RegexProfile,
    type RegexSettings,
} from "./settings";
import { runRules } from "./test-utils";

export function RegexReplacerSettingsPanel({ api }: { api: SmileyPluginApi }) {
    const [settings, setSettings] = useState(getRegexSettings());
    const [testInput, setTestInput] = useState("");
    const [status, setStatus] = useState("");
    const testResult = useMemo(
        () => runRules(testInput, settings),
        [settings, testInput],
    );

    const activeProfile =
        settings.profiles.find((p) => p.id === settings.activeProfileId) ??
        settings.profiles[0];

    async function persist(nextSettings: RegexSettings) {
        const saved = await saveRegexSettings(api, nextSettings);
        setSettings(saved);
        setStatus("Saved.");
    }

    async function updateProfile(patch: Partial<RegexProfile>) {
        if (!activeProfile) return;
        await persist({
            ...settings,
            profiles: settings.profiles.map((p) =>
                p.id === activeProfile.id ? { ...p, ...patch } : p,
            ),
        });
    }

    function updateRule(ruleId: string, patch: Partial<RegexRule>) {
        if (!activeProfile) return;
        void updateProfile({
            rules: activeProfile.rules.map((rule) =>
                rule.id === ruleId ? { ...rule, ...patch } : rule,
            ),
        });
    }

    async function addProfile() {
        const name = prompt("Name the new regex profile:", "New Profile");
        if (!name) return;
        const newProfile = createRegexProfile(name);
        await persist({
            ...settings,
            profiles: [...settings.profiles, newProfile],
            activeProfileId: newProfile.id,
        });
    }

    async function deleteProfile() {
        if (!activeProfile || settings.profiles.length <= 1) return;
        if (!window.confirm(`Delete regex profile "${activeProfile.name}"?`)) return;

        const nextProfiles = settings.profiles.filter((p) => p.id !== activeProfile.id);
        await persist({
            ...settings,
            profiles: nextProfiles,
            activeProfileId: nextProfiles[0].id,
        });
    }

    async function renameProfile() {
        if (!activeProfile) return;
        const nextName = prompt("Rename regex profile:", activeProfile.name);
        if (nextName && nextName.trim()) {
            await updateProfile({ name: nextName.trim() });
        }
    }

    return (
        <section className="rr-settings">
            <div className="rr-note">
                Rules run in order on character replies after generation, and again when a
                character message is edited or its active swipe changes.
            </div>

            <section className="rr-settings-group wide">
                <Toggle
                    checked={settings.enabled}
                    label="Enable Regex Replacer"
                    description="Disabled rules remain saved but never change chat text."
                    onChange={(enabled) => void persist({ ...settings, enabled })}
                />
            </section>

            <section className="rr-settings-group wide">
                <div className="rr-section-heading">
                    <div>
                        <h5>Profile</h5>
                        <p>Switch between rule sets or create new ones.</p>
                    </div>
                    <div className="rr-button-row">
                        <button type="button" onClick={addProfile}>
                            <Plus size={15} aria-hidden="true" />
                            New profile
                        </button>
                    </div>
                </div>
                <Field label="Active Profile">
                    <div className="rr-profile-actions">
                        <select
                            value={settings.activeProfileId}
                            onChange={(event) =>
                                void persist({
                                    ...settings,
                                    activeProfileId: event.currentTarget.value,
                                })
                            }
                        >
                            {settings.profiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={renameProfile}
                            className="rr-action-btn"
                        >
                            Rename
                        </button>
                        <button
                            type="button"
                            onClick={deleteProfile}
                            disabled={settings.profiles.length <= 1}
                            className="rr-action-btn"
                        >
                            Delete
                        </button>
                    </div>
                </Field>
            </section>

            {activeProfile && (
                <section className="rr-settings-group rr-rules wide">
                    <div className="rr-section-heading">
                        <div>
                            <h5>Rules</h5>
                            <p>
                                Rules in the {activeProfile.name} profile are applied from
                                top to bottom.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                void updateProfile({
                                    rules: [...activeProfile.rules, createRegexRule()],
                                })
                            }
                        >
                            <Plus size={15} aria-hidden="true" />
                            Add rule
                        </button>
                    </div>
                    {activeProfile.rules.length ? (
                        <div className="rr-rule-list">
                            {activeProfile.rules.map((rule, index) => (
                                <RuleEditor
                                    key={rule.id}
                                    rule={rule}
                                    index={index}
                                    error={testResult.errors.get(rule.id)}
                                    onChange={(patch) => updateRule(rule.id, patch)}
                                    onDelete={() =>
                                        void updateProfile({
                                            rules: activeProfile.rules.filter(
                                                (item) => item.id !== rule.id,
                                            ),
                                        })
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="rr-empty">
                            Add a rule to start transforming replies.
                        </p>
                    )}
                </section>
            )}

            <section className="rr-settings-group rr-test wide">
                <div className="rr-section-heading">
                    <div>
                        <h5>Test bench</h5>
                        <p>
                            Preview {activeProfile?.name} rules without changing a
                            message.
                        </p>
                    </div>
                </div>
                <Field label="Sample input">
                    <textarea
                        autoComplete="off"
                        name="regex-test-input"
                        rows={5}
                        value={testInput}
                        placeholder="Write or paste text to test your rules…"
                        onInput={(event) => setTestInput(event.currentTarget.value)}
                    />
                </Field>
                <Field label="Result">
                    <textarea readOnly rows={5} value={testResult.text} />
                </Field>
                {testResult.errors.size > 0 && (
                    <p className="rr-error" role="alert">
                        Fix invalid rule patterns or flags before enabling them.
                    </p>
                )}
            </section>

            <p className="rr-status wide" aria-live="polite">
                {status}
            </p>
        </section>
    );
}

function RuleEditor({
    error,
    index,
    onChange,
    onDelete,
    rule,
}: {
    error?: string;
    index: number;
    onChange: (patch: Partial<RegexRule>) => void;
    onDelete: () => void;
    rule: RegexRule;
}) {
    function confirmDelete() {
        if (window.confirm(`Delete ${rule.description || `rule ${index + 1}`}?`))
            onDelete();
    }

    return (
        <article className={error ? "rr-rule invalid" : "rr-rule"}>
            <div className="rr-rule-header">
                <strong>Rule {index + 1}</strong>
                <div>
                    <label className="rr-inline-check">
                        <input
                            checked={rule.enabled}
                            type="checkbox"
                            onChange={(event) =>
                                onChange({ enabled: event.currentTarget.checked })
                            }
                        />
                        Enabled
                    </label>
                    <button
                        type="button"
                        className="danger-button"
                        aria-label="Delete rule"
                        title="Delete rule"
                        onClick={confirmDelete}
                    >
                        <Trash2 size={15} aria-hidden="true" />
                    </button>
                </div>
            </div>
            <div className="rr-rule-grid">
                <Field label="Description" wide>
                    <input
                        autoComplete="off"
                        name={`regex-description-${rule.id}`}
                        value={rule.description}
                        placeholder="e.g. Remove unwanted tags"
                        onInput={(event) =>
                            onChange({ description: event.currentTarget.value })
                        }
                    />
                </Field>
                <div className="rr-rule-group rr-rule-pattern">
                    <Field label="Pattern">
                        <input
                            autoComplete="off"
                            name={`regex-pattern-${rule.id}`}
                            className={error ? "input-error" : ""}
                            value={rule.pattern}
                            placeholder="Regular expression, without /slashes/"
                            spellcheck={false}
                            onInput={(event) =>
                                onChange({ pattern: event.currentTarget.value })
                            }
                        />
                        {error && <small className="rr-inline-error">{error}</small>}
                    </Field>
                    <Field label="Flags">
                        <input
                            autoComplete="off"
                            name={`regex-flags-${rule.id}`}
                            value={rule.flags}
                            placeholder="g"
                            spellcheck={false}
                            onInput={(event) =>
                                onChange({ flags: event.currentTarget.value })
                            }
                        />
                    </Field>
                </div>
                <Field label="Trim out" wide>
                    <input
                        autoComplete="off"
                        name={`regex-trim-${rule.id}`}
                        value={rule.trimOut}
                        placeholder="Literal text removed from match before replacement"
                        onInput={(event) =>
                            onChange({ trimOut: event.currentTarget.value })
                        }
                    />
                </Field>
                <Field label="Replacement" wide>
                    <input
                        autoComplete="off"
                        name={`regex-replacement-${rule.id}`}
                        value={rule.replacement}
                        placeholder="Replacement text; $1 references a capture group"
                        onInput={(event) =>
                            onChange({ replacement: event.currentTarget.value })
                        }
                    />
                </Field>

                <div className="rr-rule-group rr-rule-advanced">
                    <Field label="Apply changes to">
                        <select
                            value={rule.destination}
                            onChange={(event) =>
                                onChange({
                                    destination: event.currentTarget
                                        .value as RegexRule["destination"],
                                })
                            }
                        >
                            <option value="save">Saved chat file</option>
                            <option value="display">Display only</option>
                            <option value="prompt">Outgoing prompt only</option>
                        </select>
                    </Field>
                    <Field label="Min depth">
                        <input
                            title="-1 = no limit; 0 = newest"
                            min={0}
                            type="number"
                            value={rule.minDepth}
                            onInput={(event) =>
                                onChange({ minDepth: Number(event.currentTarget.value) })
                            }
                        />
                    </Field>
                    <Field label="Max depth">
                        <input
                            title="-1 = no limit; 0 = newest"
                            min={-1}
                            type="number"
                            value={rule.maxDepth}
                            onInput={(event) =>
                                onChange({ maxDepth: Number(event.currentTarget.value) })
                            }
                        />
                    </Field>
                </div>

                <Field label="Affects" wide>
                    <div className="rr-targets-grid">
                        <Target
                            checked={rule.targets.userInput}
                            label="User input"
                            onChange={(userInput) =>
                                onChange({ targets: { ...rule.targets, userInput } })
                            }
                        />
                        <Target
                            checked={rule.targets.aiResponse}
                            label="AI responses"
                            onChange={(aiResponse) =>
                                onChange({ targets: { ...rule.targets, aiResponse } })
                            }
                        />
                        <Target
                            checked={rule.targets.slashCommand}
                            label="Slash commands"
                            onChange={(slashCommand) =>
                                onChange({ targets: { ...rule.targets, slashCommand } })
                            }
                        />
                        <Target
                            checked={rule.targets.worldInfo}
                            label="World Info"
                            onChange={(worldInfo) =>
                                onChange({ targets: { ...rule.targets, worldInfo } })
                            }
                        />
                        <Target
                            checked={rule.targets.reasoning}
                            label="Reasoning blocks"
                            onChange={(reasoning) =>
                                onChange({ targets: { ...rule.targets, reasoning } })
                            }
                        />
                    </div>
                </Field>
            </div>
        </article>
    );
}

function Target({
    checked,
    label,
    onChange,
}: {
    checked: boolean;
    label: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="rr-toggle">
            <span>
                <span>{label}</span>
            </span>
            <input
                checked={checked}
                type="checkbox"
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
        </label>
    );
}

function Field({
    children,
    label,
    wide = false,
}: {
    children: ComponentChildren;
    label: string;
    wide?: boolean;
}) {
    return (
        <label className={wide ? "rr-field wide" : "rr-field"}>
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
        <label className="rr-toggle">
            <span>
                <span>{label}</span>
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
