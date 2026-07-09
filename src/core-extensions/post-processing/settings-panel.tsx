import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-preact";
import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

import type { PluginAppSnapshot, SmileyPluginApi } from "#frontend/lib/plugins/types";

import { getPostProcessingSettings, savePostProcessingSettings } from "./controller";
import {
    activePipeline,
    createNewPass,
    createDefaultPipeline,
    type PipelinePass,
    type PostProcessingPipeline,
    type PostProcessingSettings,
} from "./settings";

type SettingsPanelProps = {
    api: SmileyPluginApi;
    snapshot: PluginAppSnapshot;
};

export function PostProcessingSettingsPanel({ api, snapshot }: SettingsPanelProps) {
    const [settings, setSettings] = useState(getPostProcessingSettings());
    const [selectedPassId, setSelectedPassId] = useState(
        activePipeline(settings)?.passes[0]?.id ?? "",
    );
    const [status, setStatus] = useState("");
    const pipeline = activePipeline(settings);
    const selectedPass =
        pipeline?.passes.find((pass) => pass.id === selectedPassId) ??
        pipeline?.passes[0];

    async function persist(nextSettings: PostProcessingSettings) {
        const saved = await savePostProcessingSettings(api, nextSettings);
        setSettings(saved);
        setStatus("Saved.");
        return saved;
    }

    async function updateGlobal(patch: Partial<PostProcessingSettings>) {
        await persist({ ...settings, ...patch });
    }

    async function updatePipeline(patch: Partial<PostProcessingPipeline>) {
        if (!pipeline) {
            return;
        }

        await persist({
            ...settings,
            pipelines: settings.pipelines.map((item) =>
                item.id === pipeline.id ? { ...item, ...patch } : item,
            ),
        });
    }

    async function updatePass(passId: string, patch: Partial<PipelinePass>) {
        if (!pipeline) {
            return;
        }

        await updatePipeline({
            passes: pipeline.passes.map((pass) =>
                pass.id === passId ? { ...pass, ...patch } : pass,
            ),
        });
    }

    async function addPipeline() {
        const nextPipeline = createDefaultPipeline();
        await persist({
            ...settings,
            activePipelineId: nextPipeline.id,
            pipelines: [...settings.pipelines, nextPipeline],
        });
        setSelectedPassId(nextPipeline.passes[0]?.id ?? "");
    }

    async function addPass() {
        if (!pipeline) {
            return;
        }

        const pass = createNewPass();
        await updatePipeline({ passes: [...pipeline.passes, pass] });
        setSelectedPassId(pass.id);
    }

    async function deletePass(passId: string) {
        if (!pipeline) {
            return;
        }

        const pass = pipeline.passes.find((item) => item.id === passId);

        if (
            !window.confirm(
                `Delete "${pass?.name || "Untitled Pass"}" from this pipeline?`,
            )
        ) {
            return;
        }

        const nextPasses = pipeline.passes.filter((p) => p.id !== passId);
        await updatePipeline({ passes: nextPasses });
        setSelectedPassId(nextPasses[0]?.id ?? "");
    }

    async function movePass(passId: string, direction: -1 | 1) {
        if (!pipeline) {
            return;
        }

        const index = pipeline.passes.findIndex((pass) => pass.id === passId);
        const targetIndex = index + direction;

        if (index < 0 || targetIndex < 0 || targetIndex >= pipeline.passes.length) {
            return;
        }

        const nextPasses = [...pipeline.passes];
        const [pass] = nextPasses.splice(index, 1);
        nextPasses.splice(targetIndex, 0, pass);
        await updatePipeline({ passes: nextPasses });
    }

    return (
        <section className="spp-settings">
            <div className="spp-note">
                Post-processing sends generated text through extra model calls before it
                is saved. Keep automatic runs off unless the extra latency and token use
                are intentional.
            </div>

            <section className="spp-settings-group">
                <h5>Run Behavior</h5>
                <Toggle
                    checked={settings.enabled}
                    description="Allows automatic and manual post-processing."
                    label="Enable extension"
                    onChange={(enabled) => void updateGlobal({ enabled })}
                />
                <Toggle
                    checked={settings.autoRun}
                    description="Runs the active pipeline on new model replies."
                    label="Auto-run on generation"
                    onChange={(autoRun) => void updateGlobal({ autoRun })}
                />
                <Toggle
                    checked={settings.showDiff}
                    description="Shows a review window before saving processed text."
                    label="Show review"
                    onChange={(showDiff) => void updateGlobal({ showDiff })}
                />
                <Field label="Minimum characters">
                    <input
                        min={0}
                        max={100000}
                        type="number"
                        value={settings.minChars}
                        onInput={(event) =>
                            void updateGlobal({
                                minChars: Number(event.currentTarget.value),
                            })
                        }
                    />
                </Field>
            </section>

            <section className="spp-settings-group">
                <h5>Pipeline</h5>
                <Field label="Active pipeline">
                    <select
                        value={settings.activePipelineId}
                        onChange={(event) => {
                            const nextPipelineId = event.currentTarget.value;
                            const nextPipeline = settings.pipelines.find(
                                (item) => item.id === nextPipelineId,
                            );
                            setSelectedPassId(nextPipeline?.passes[0]?.id ?? "");
                            void updateGlobal({ activePipelineId: nextPipelineId });
                        }}
                    >
                        {settings.pipelines.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </Field>
                {pipeline && (
                    <Field label="Pipeline name">
                        <input
                            type="text"
                            value={pipeline.name}
                            onInput={(event) =>
                                void updatePipeline({
                                    name: event.currentTarget.value,
                                })
                            }
                        />
                    </Field>
                )}
                <div className="spp-button-row">
                    <button type="button" onClick={() => void addPipeline()}>
                        <Plus size={14} aria-hidden="true" />
                        <span>Add Pipeline</span>
                    </button>
                    <button type="button" onClick={() => void addPass()}>
                        <Plus size={14} aria-hidden="true" />
                        <span>Add Pass</span>
                    </button>
                </div>
            </section>

            <section className="spp-settings-group spp-pass-list">
                <h5>Passes</h5>
                {pipeline?.passes.length ? (
                    pipeline.passes.map((pass, index) => (
                        <article
                            className={pass.id === selectedPass?.id ? "active" : ""}
                            key={pass.id}
                        >
                            <button
                                type="button"
                                onClick={() => setSelectedPassId(pass.id)}
                            >
                                <strong>{pass.name}</strong>
                                <small>{pass.enabled ? "Enabled" : "Disabled"}</small>
                            </button>
                            <div>
                                <button
                                    type="button"
                                    title="Move pass up"
                                    disabled={index === 0}
                                    onClick={() => void movePass(pass.id, -1)}
                                >
                                    <ArrowUp size={14} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    title="Move pass down"
                                    disabled={index === pipeline.passes.length - 1}
                                    onClick={() => void movePass(pass.id, 1)}
                                >
                                    <ArrowDown size={14} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    title="Delete pass"
                                    className="danger-button"
                                    onClick={() => deletePass(pass.id)}
                                >
                                    <Trash2 size={14} aria-hidden="true" />
                                </button>
                            </div>
                        </article>
                    ))
                ) : (
                    <p>No passes in this pipeline.</p>
                )}
            </section>

            <section className="spp-settings-group wide">
                <h5>Pass Editor</h5>
                {selectedPass ? (
                    <PassEditor
                        pass={selectedPass}
                        profiles={snapshot.connectionSettings.profiles}
                        presets={snapshot.presetCollection.presets}
                        onChange={(patch) => void updatePass(selectedPass.id, patch)}
                        onDelete={() => deletePass(selectedPass.id)}
                    />
                ) : (
                    <p className="spp-muted">Add a pass to edit this pipeline.</p>
                )}
            </section>

            <p className="spp-status" aria-live="polite">
                {status}
            </p>
        </section>
    );
}

function PassEditor({
    onChange,
    onDelete,
    pass,
    presets,
    profiles,
}: {
    onChange: (patch: Partial<PipelinePass>) => void;
    onDelete: () => void;
    pass: PipelinePass;
    presets: PluginAppSnapshot["presetCollection"]["presets"];
    profiles: PluginAppSnapshot["connectionSettings"]["profiles"];
}) {
    const usesPreset = pass.presetId.trim().length > 0;

    return (
        <div className="spp-pass-editor">
            <div className="spp-pass-editor-grid">
                <Field label="Pass name">
                    <input
                        type="text"
                        value={pass.name}
                        onInput={(event) => onChange({ name: event.currentTarget.value })}
                    />
                </Field>
                <Field label="Connection profile">
                    <select
                        value={pass.profileId}
                        onChange={(event) =>
                            onChange({ profileId: event.currentTarget.value })
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
                <Field label="Prompt preset">
                    <select
                        value={pass.presetId}
                        onChange={(event) =>
                            onChange({ presetId: event.currentTarget.value })
                        }
                    >
                        <option value="">No preset</option>
                        {presets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.title || preset.id}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Custom model name">
                    <input
                        autoComplete="off"
                        type="text"
                        value={pass.modelId}
                        placeholder="Use selected profile model..."
                        onInput={(event) =>
                            onChange({ modelId: event.currentTarget.value })
                        }
                    />
                    <small className="spp-field-hint">
                        Leave empty to use the model configured on the selected connection
                        profile.
                    </small>
                </Field>
                <Field label="Context messages">
                    <input
                        autoComplete="off"
                        min={-1}
                        max={100000}
                        type="number"
                        value={pass.contextMessageLimit}
                        onInput={(event) =>
                            onChange({
                                contextMessageLimit: Number(event.currentTarget.value),
                            })
                        }
                    />
                    <small className="spp-field-hint">
                        Use -1 for all available messages, automatically trimmed to fit
                        the selected context budget. Use 0 for no chat history.
                    </small>
                </Field>
            </div>
            {usesPreset && (
                <div className="spp-note">
                    Preset mode compiles this pass through the selected preset. Character,
                    scene, macros, roles, and prompt injection behavior come from that
                    preset. The preset should include chat history or{" "}
                    <code>{"{{chat_history}}"}</code>
                    so the text to transform is included.
                </div>
            )}
            <div className="spp-toggle-row">
                <Toggle
                    checked={pass.enabled}
                    description="Disabled passes are skipped."
                    label="Enabled"
                    onChange={(enabled) => onChange({ enabled })}
                />
                {!usesPreset && (
                    <>
                        <Toggle
                            checked={pass.includeCharacter}
                            description="Includes focused character card fields."
                            label="Character context"
                            onChange={(includeCharacter) =>
                                onChange({ includeCharacter })
                            }
                        />
                        <Toggle
                            checked={pass.includeSceneContext}
                            description="Includes recent conversation turns."
                            label="Scene context"
                            onChange={(includeSceneContext) =>
                                onChange({ includeSceneContext })
                            }
                        />
                    </>
                )}
                <Toggle
                    checked={pass.stream}
                    description="Shows live pass output when supported."
                    label="Stream pass"
                    onChange={(stream) => onChange({ stream })}
                />
            </div>
            <Field label="System prompt">
                <textarea
                    rows={10}
                    value={pass.prompt}
                    onInput={(event) => onChange({ prompt: event.currentTarget.value })}
                />
                {pass.prompt.trim().length === 0 && (
                    <small className="spp-inline-warning">
                        This pass will run without a system prompt.
                    </small>
                )}
            </Field>
            <div className="spp-button-row">
                <button className="danger-button" type="button" onClick={onDelete}>
                    <Trash2 size={14} aria-hidden="true" />
                    <span>Delete Pass</span>
                </button>
            </div>
        </div>
    );
}

function Field({ children, label }: { children: ComponentChildren; label: string }) {
    return (
        <label className="spp-field">
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
        <label className="spp-toggle">
            <input
                checked={checked}
                type="checkbox"
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
            <span>
                {label}
                <small>{description}</small>
            </span>
        </label>
    );
}
