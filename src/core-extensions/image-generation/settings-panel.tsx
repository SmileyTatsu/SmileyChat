import { CheckCircle2, LoaderCircle, RotateCcw } from "lucide-preact";
import { useState } from "preact/hooks";

import type { PluginAppSnapshot, SmileyPluginApi } from "#frontend/lib/plugins/types";

import { PROMPT_MACRO } from "./master-prompt";
import {
    applyOnlyFreeLimits,
    defaultImageGenerationSettings,
    getImageGenerationSettings,
    NOVELAI_SAMPLERS,
    type ImageGenerationSettings,
    type NovelAIImageFormat,
    type NovelAIQualityTags,
    type NovelAISampler,
    type NovelAIUCPreset,
} from "./settings";
import {
    useImageSettingsAutosave,
    type RequestState,
} from "./use-image-settings-autosave";

type SettingsPanelProps = {
    api: SmileyPluginApi;
    snapshot: PluginAppSnapshot;
};

export function ImageGenerationSettingsPanel({ api, snapshot }: SettingsPanelProps) {
    const [draft, setDraft] = useState(getImageGenerationSettings());
    const { requestState, statusMessage } = useImageSettingsAutosave({
        api,
        settings: draft,
        onSettingsChange: setDraft,
    });
    const novelAIProfiles = snapshot.connectionSettings.profiles.filter(
        (profile) => profile.provider === "novelai",
    );

    function patch(value: Partial<ImageGenerationSettings>) {
        setDraft((current) => {
            const next = { ...current, ...value };
            if (next.allowModelAspectRatio) {
                next.width = 832;
                next.height = 1216;
            }
            return next.onlyFree ? applyOnlyFreeLimits(next) : next;
        });
    }

    const saveBadge = (requestState === "loading" || requestState === "success") && (
        <span
            className={`preset-save-badge ${requestState}`}
            role="status"
            title={statusMessage}
        >
            {requestState === "loading" ? (
                <LoaderCircle aria-hidden="true" size={14} />
            ) : (
                <CheckCircle2 aria-hidden="true" size={14} />
            )}
            {requestState === "loading" ? "Saving..." : "Saved"}
        </span>
    );

    return (
        <section className="sig-settings">
            <div className="sig-settings-topbar">
                <div className="sig-note">
                    The master prompt is preserved exactly. SmileyChat replaces the single
                    <code translate={false}>{PROMPT_MACRO}</code> marker and never
                    rewrites the surrounding text.
                </div>
                {saveBadge}
            </div>

            {requestState === "error" && statusMessage && (
                <p className="connection-status error" role="status">
                    {statusMessage}
                </p>
            )}

            <SettingsGroup title="Prompt Assembly">
                <Field
                    label="Master prompt"
                    hint={`Must contain ${PROMPT_MACRO} exactly once.`}
                >
                    <textarea
                        name="image-master-prompt"
                        autoComplete="off"
                        className="sig-code"
                        rows={10}
                        value={draft.masterPrompt}
                        onInput={(event) =>
                            patch({ masterPrompt: event.currentTarget.value })
                        }
                    />
                </Field>
                <Field
                    label="Prompt-writer instruction"
                    hint="Editable system instruction used to create only the macro insertion."
                >
                    <textarea
                        name="image-prompt-writer-instruction"
                        autoComplete="off"
                        rows={16}
                        value={draft.promptInstruction}
                        onInput={(event) =>
                            patch({ promptInstruction: event.currentTarget.value })
                        }
                    />
                </Field>
                <Field
                    label="Prompt-writer connection"
                    hint="Defaults to the active chat connection."
                >
                    <select
                        name="image-prompt-writer-profile"
                        value={draft.promptWriterProfileId}
                        onChange={(event) =>
                            patch({ promptWriterProfileId: event.currentTarget.value })
                        }
                    >
                        <option value="">Active chat connection</option>
                        {snapshot.connectionSettings.profiles.map((profile) => (
                            <option value={profile.id} key={profile.id}>
                                {profile.name} · {profile.provider}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field
                    label="Prompt-writer custom model"
                    hint="Optional model ID override (e.g. gpt-4o-mini, gemini-2.5-flash). Leave blank to use the connection's active model."
                >
                    <input
                        name="image-prompt-writer-model"
                        type="text"
                        autoComplete="off"
                        placeholder="Default connection model"
                        value={draft.promptWriterModelId}
                        onInput={(event) =>
                            patch({ promptWriterModelId: event.currentTarget.value })
                        }
                    />
                </Field>
                <label className="sig-toggle">
                    <span>
                        <span>Raw prompt writer</span>
                        <small>
                            Asks the model to output raw NovelAI prompt tags directly
                            instead of structured JSON. Recommended for smaller, local, or
                            roleplay models.
                        </small>
                    </span>
                    <input
                        name="image-raw-prompt-writer"
                        type="checkbox"
                        checked={draft.rawPromptWriter}
                        onChange={(event) =>
                            patch({ rawPromptWriter: event.currentTarget.checked })
                        }
                    />
                </label>
                <label className="sig-toggle">
                    <span>
                        <span>Send preset and recent chat context</span>
                        <small>
                            Compiles the selected preset with a bounded slice of recent
                            messages before asking the prompt writer.
                        </small>
                    </span>
                    <input
                        name="image-include-preset-context"
                        type="checkbox"
                        checked={draft.includePresetContext}
                        onChange={(event) =>
                            patch({
                                includePresetContext: event.currentTarget.checked,
                            })
                        }
                    />
                </label>
                <div className="sig-field-row">
                    <Field
                        label="Prompt-writer preset"
                        hint="Active preset follows the preset selected for the current chat."
                    >
                        <select
                            name="image-prompt-writer-preset"
                            value={draft.promptWriterPresetId}
                            disabled={!draft.includePresetContext}
                            onChange={(event) =>
                                patch({
                                    promptWriterPresetId: event.currentTarget.value,
                                })
                            }
                        >
                            <option value="">Active preset</option>
                            {snapshot.presetCollection.presets.map((preset) => (
                                <option value={preset.id} key={preset.id}>
                                    {preset.title}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <NumberField
                        label="Recent messages"
                        value={draft.promptWriterHistoryLimit}
                        min={0}
                        max={50}
                        disabled={!draft.includePresetContext}
                        onChange={(promptWriterHistoryLimit) =>
                            patch({ promptWriterHistoryLimit })
                        }
                    />
                </div>
                <Field
                    label="Generated-image history context"
                    hint="Historical generated images are always text-only. Tags use the exact generated insertion; label uses the prompt writer's compact visual summary."
                >
                    <select
                        name="image-generated-context-mode"
                        value={draft.generatedImageContextMode}
                        onChange={(event) =>
                            patch({
                                generatedImageContextMode: event.currentTarget
                                    .value as ImageGenerationSettings["generatedImageContextMode"],
                            })
                        }
                    >
                        <option value="tags">Prompt tags (default)</option>
                        <option value="label">AI-written label</option>
                    </select>
                </Field>
            </SettingsGroup>

            <SettingsGroup title="NovelAI">
                <Field
                    label="Connection profile"
                    hint="Uses the token already stored in Connections."
                >
                    <select
                        name="image-novelai-profile"
                        value={draft.novelAIProfileId}
                        onChange={(event) =>
                            patch({ novelAIProfileId: event.currentTarget.value })
                        }
                    >
                        <option value="">
                            Active NovelAI profile, then first available
                        </option>
                        {novelAIProfiles.map((profile) => (
                            <option value={profile.id} key={profile.id}>
                                {profile.name}
                            </option>
                        ))}
                    </select>
                </Field>
                <div className="sig-field-row">
                    <Field label="Image model">
                        <input
                            name="image-model"
                            autoComplete="off"
                            value={draft.model}
                            list="sig-novelai-models"
                            onInput={(event) =>
                                patch({ model: event.currentTarget.value })
                            }
                        />
                        <datalist id="sig-novelai-models">
                            <option value="nai-diffusion-5-full" />
                            <option value="nai-diffusion-5-curated" />
                            <option value="nai-diffusion-4-5-full" />
                            <option value="nai-diffusion-4-5-curated" />
                            <option value="nai-diffusion-4-full" />
                            <option value="nai-diffusion-4-curated-preview" />
                        </datalist>
                    </Field>
                    <Field label="API base URL">
                        <input
                            name="image-api-base-url"
                            type="url"
                            autoComplete="off"
                            value={draft.baseUrl}
                            onInput={(event) =>
                                patch({ baseUrl: event.currentTarget.value })
                            }
                        />
                    </Field>
                </div>
            </SettingsGroup>

            <SettingsGroup title="Generation Defaults">
                <label className="sig-toggle">
                    <span>
                        <span>Only free generations</span>
                        <small>
                            Enforces one image, at most 1 megapixel, and no more than 28
                            steps.
                        </small>
                    </span>
                    <input
                        name="image-only-free"
                        type="checkbox"
                        checked={draft.onlyFree}
                        onChange={(event) =>
                            patch({ onlyFree: event.currentTarget.checked })
                        }
                    />
                </label>
                <label className="sig-toggle">
                    <span>
                        <span>Model-selected aspect ratio</span>
                        <small>
                            Enables optional square (1024×1024), widescreen (1216×832),
                            and portrait (832×1216) tool parameters within free limits.
                            Disables custom canvas resolution.
                        </small>
                    </span>
                    <input
                        name="image-allow-model-aspect-ratio"
                        type="checkbox"
                        checked={draft.allowModelAspectRatio}
                        onChange={(event) =>
                            patch({
                                allowModelAspectRatio: event.currentTarget.checked,
                            })
                        }
                    />
                </label>
                <div className="sig-number-grid">
                    <NumberField
                        label="Width"
                        value={draft.width}
                        min={64}
                        max={2048}
                        disabled={draft.allowModelAspectRatio}
                        hint={
                            draft.allowModelAspectRatio ? "Standard 832×1216" : undefined
                        }
                        onChange={(width) => patch({ width })}
                    />
                    <NumberField
                        label="Height"
                        value={draft.height}
                        min={64}
                        max={2048}
                        disabled={draft.allowModelAspectRatio}
                        hint={
                            draft.allowModelAspectRatio ? "Standard 832×1216" : undefined
                        }
                        onChange={(height) => patch({ height })}
                    />
                    <NumberField
                        label="Steps"
                        value={draft.steps}
                        min={1}
                        max={draft.onlyFree ? 28 : 50}
                        onChange={(steps) => patch({ steps })}
                    />
                    <NumberField
                        label="Guidance"
                        value={draft.scale}
                        min={0}
                        max={20}
                        step={0.1}
                        onChange={(scale) => patch({ scale })}
                    />
                    <NumberField
                        label="CFG rescale"
                        value={draft.cfgRescale}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(cfgRescale) => patch({ cfgRescale })}
                    />
                    <NumberField
                        label="Image count"
                        value={draft.imageCount}
                        min={1}
                        max={draft.onlyFree ? 1 : 4}
                        disabled={draft.onlyFree}
                        onChange={(imageCount) => patch({ imageCount })}
                    />
                </div>
                <div className="sig-field-row">
                    <Field label="Sampler">
                        <select
                            name="image-sampler"
                            value={draft.sampler}
                            onChange={(event) =>
                                patch({
                                    sampler: event.currentTarget.value as NovelAISampler,
                                })
                            }
                        >
                            {NOVELAI_SAMPLERS.map((sampler) => (
                                <option value={sampler.id} key={sampler.id}>
                                    {sampler.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Noise schedule">
                        <input
                            name="image-noise-schedule"
                            autoComplete="off"
                            value={draft.noiseSchedule}
                            onInput={(event) =>
                                patch({ noiseSchedule: event.currentTarget.value })
                            }
                        />
                    </Field>
                </div>
                <div className="sig-field-row">
                    <Field
                        label="Quality tags"
                        hint="NovelAI’s model-specific positive quality preset."
                    >
                        <select
                            name="image-quality-tags"
                            value={draft.qualityTags}
                            onChange={(event) =>
                                patch({
                                    qualityTags: event.currentTarget
                                        .value as NovelAIQualityTags,
                                })
                            }
                        >
                            <option value="standard">Standard</option>
                            <option value="light">Light</option>
                            <option value="none">None</option>
                        </select>
                    </Field>
                    <Field label="UC preset" hint="NovelAI’s undesired-content preset.">
                        <select
                            name="image-uc-preset"
                            value={draft.ucPreset}
                            onChange={(event) =>
                                patch({
                                    ucPreset: event.currentTarget
                                        .value as NovelAIUCPreset,
                                })
                            }
                        >
                            <option value="heavy">Heavy</option>
                            <option value="light">Light</option>
                            <option value="furryFocus">Furry Focus</option>
                            <option value="humanFocus">Human Focus</option>
                            <option value="none">None</option>
                        </select>
                    </Field>
                </div>
                <Field
                    label="Image format"
                    hint="Responses always use NovelAI's JSON/base64 mode; ZIP responses are disabled."
                >
                    <select
                        name="image-format"
                        value={draft.imageFormat}
                        onChange={(event) =>
                            patch({
                                imageFormat: event.currentTarget
                                    .value as NovelAIImageFormat,
                            })
                        }
                    >
                        <option value="png">PNG</option>
                        <option value="webp">WebP</option>
                    </select>
                </Field>
                <Field label="Negative prompt">
                    <textarea
                        name="image-negative-prompt"
                        autoComplete="off"
                        rows={5}
                        value={draft.negativePrompt}
                        onInput={(event) =>
                            patch({ negativePrompt: event.currentTarget.value })
                        }
                    />
                </Field>
            </SettingsGroup>

            <div className="sig-settings-actions">
                <button
                    type="button"
                    onClick={() => patch(defaultImageGenerationSettings)}
                >
                    <RotateCcw size={15} aria-hidden="true" /> Reset Defaults
                </button>
                {requestState === "error" && statusMessage && (
                    <span
                        className="connection-status error"
                        role="status"
                        style={{ margin: 0 }}
                    >
                        {statusMessage}
                    </span>
                )}
                {saveBadge}
            </div>
        </section>
    );
}

function SettingsGroup({
    title,
    children,
}: {
    title: string;
    children: preact.ComponentChildren;
}) {
    return (
        <section className="sig-settings-group">
            <h5>{title}</h5>
            {children}
        </section>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: preact.ComponentChildren;
}) {
    return (
        <label className="sig-field">
            <span>{label}</span>
            {hint && <small>{hint}</small>}
            {children}
        </label>
    );
}

function NumberField({
    label,
    hint,
    value,
    min,
    max,
    step = 1,
    disabled = false,
    onChange,
}: {
    label: string;
    hint?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    onChange: (value: number) => void;
}) {
    return (
        <Field label={label} hint={hint}>
            <input
                name={`image-${label.toLowerCase().replace(/\s+/g, "-")}`}
                autoComplete="off"
                type="number"
                inputMode="decimal"
                value={value}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onInput={(event) => onChange(event.currentTarget.valueAsNumber)}
            />
        </Field>
    );
}
