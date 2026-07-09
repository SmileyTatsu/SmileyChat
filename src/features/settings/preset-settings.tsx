import {
    AlertTriangle,
    Download,
    Eye,
    FilePenLine,
    Plus,
    SlidersHorizontal,
    Trash,
    Upload,
} from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { messageFromError } from "#frontend/lib/common/errors";
import { isRecord } from "#frontend/lib/common/guards";
import { createId } from "#frontend/lib/common/ids";
import {
    getActiveConnectionProfile,
    type ConnectionSettings,
} from "#frontend/lib/connections/config";
import { isClaudeOpus47OrLaterModel } from "#frontend/lib/connections/generation-settings";
import {
    compilePresetContext,
    compilePresetMessages,
} from "#frontend/lib/presets/compile";
import type { PresetGenerationSettings } from "#frontend/lib/presets/types";
import {
    createBlankPrompt,
    createPresetFromDefault,
    importSillyTavernPreset,
    normalizePreset,
    normalizePresetCollection,
} from "#frontend/lib/presets/normalize";
import type {
    PresetCollection,
    PresetPrompt,
    SmileyPreset,
} from "#frontend/lib/presets/types";
import type {
    ChatMode,
    Message,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import {
    PresetConfirmDialog,
    type PresetConfirmAction,
} from "./presets/preset-confirm-dialog";
import { PresetEditor, type OrderedPrompt } from "./presets/preset-editor";
import { PresetPreview } from "./presets/preset-preview";
import {
    collectPresetWarnings,
    warningsForPromptDeletion,
} from "./presets/preset-warnings";
import { usePresetAutosave } from "./presets/use-preset-autosave";

type PresetSettingsProps = {
    character: SmileyCharacter;
    connectionSettings: ConnectionSettings;
    collection: PresetCollection;
    loadError?: string;
    messages: Message[];
    mode: ChatMode;
    onCollectionChange: (collection: PresetCollection) => void;
    persona: SmileyPersona;
    userStatus: UserStatus;
};

type PresetPanelView = "editor" | "generation" | "preview";

export function PresetSettings({
    character,
    connectionSettings,
    collection,
    loadError,
    messages,
    mode,
    onCollectionChange,
    persona,
    userStatus,
}: PresetSettingsProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedPromptId, setSelectedPromptId] = useState("");
    const [activeView, setActiveView] = useState<PresetPanelView>("editor");
    const [confirmAction, setConfirmAction] = useState<PresetConfirmAction | undefined>();
    const { requestState, setRequestState, setStatusMessage, statusMessage } =
        usePresetAutosave({
            collection,
            loadError,
            onCollectionChange,
        });

    const activePreset = useMemo(
        () =>
            collection.presets.find(
                (preset) => preset.id === collection.activePresetId,
            ) ?? collection.presets[0],
        [collection],
    );

    const selectedPrompt = activePreset?.prompts.find(
        (prompt) => prompt.id === selectedPromptId,
    );
    const selectedPromptOrderEntry = activePreset?.promptOrder.find(
        (entry) => entry.promptId === selectedPromptId,
    );
    const orderedPrompts = activePreset
        ? activePreset.promptOrder
              .map((entry) => ({
                  entry,
                  prompt: activePreset.prompts.find(
                      (prompt) => prompt.id === entry.promptId,
                  ),
              }))
              .filter((item): item is OrderedPrompt => Boolean(item.prompt))
        : [];
    const compiledContextPreview = useMemo(
        () =>
            compilePresetContext(activePreset, {
                character,
                messages,
                mode,
                personaDescription: persona.description,
                personaName: persona.name,
                userStatus,
            }),
        [activePreset, character, messages, mode, persona, userStatus],
    );
    const compiledMessagesPreview = useMemo(
        () =>
            compilePresetMessages(activePreset, {
                character,
                messages,
                mode,
                personaDescription: persona.description,
                personaName: persona.name,
                userStatus,
            }),
        [activePreset, character, messages, mode, persona, userStatus],
    );
    const presetWarnings = useMemo(
        () => collectPresetWarnings(activePreset, selectedPrompt),
        [activePreset, selectedPrompt],
    );
    const generationWarnings = useMemo(
        () => collectGenerationWarnings(activePreset?.generation, connectionSettings),
        [activePreset?.generation, connectionSettings],
    );

    useEffect(() => {
        if (!activePreset) {
            setSelectedPromptId("");
            return;
        }

        const hasSelectedPrompt = activePreset.prompts.some(
            (prompt) => prompt.id === selectedPromptId,
        );

        if (!hasSelectedPrompt) {
            setSelectedPromptId(activePreset.promptOrder[0]?.promptId ?? "");
        }
    }, [activePreset, selectedPromptId]);

    async function importPresetFile(file: File) {
        setRequestState("loading");

        try {
            const raw = JSON.parse(await file.text()) as unknown;
            const isSmileyPreset = isRecord(raw) && Array.isArray(raw.promptOrder);
            const imported = isSmileyPreset
                ? (() => {
                      const preset = normalizePreset(raw);

                      return {
                          preset: {
                              ...preset,
                              id: createId("preset"),
                          },
                          status: "Imported SmileyChat preset.",
                      };
                  })()
                : (() => {
                      const { preset, summary } = importSillyTavernPreset(
                          raw,
                          file.name.replace(/\.json$/i, ""),
                      );

                      return {
                          preset,
                          status: `Imported ${summary.importedPrompts} prompt(s), ${summary.enabledPrompts} enabled, ${summary.importedGenerationFields.length} generation field(s). Ignored ${summary.ignoredFields.length} unsupported field(s).`,
                      };
                  })();
            const nextCollection = normalizePresetCollection({
                activePresetId: imported.preset.id,
                presets: [...collection.presets, imported.preset],
            });

            onCollectionChange(nextCollection);
            setSelectedPromptId(imported.preset.promptOrder[0]?.promptId ?? "");
            setStatusMessage(imported.status);
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Unexpected preset error."));
            setRequestState("error");
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    }

    function exportActivePreset() {
        if (!activePreset) {
            return;
        }

        const blob = new Blob([`${JSON.stringify(activePreset, null, 2)}\n`], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${activePreset.title || "preset"}.smiley-preset.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function updateCollection(nextCollection: PresetCollection) {
        onCollectionChange(normalizePresetCollection(nextCollection));
    }

    function updateActivePreset(updater: (preset: SmileyPreset) => SmileyPreset) {
        if (!activePreset) {
            return;
        }

        updateCollection({
            ...collection,
            presets: collection.presets.map((preset) =>
                preset.id === activePreset.id
                    ? updater({
                          ...preset,
                          updatedAt: new Date().toISOString(),
                      })
                    : preset,
            ),
        });
    }

    function updatePrompt(promptId: string, nextPrompt: Partial<PresetPrompt>) {
        updateActivePreset((preset) => ({
            ...preset,
            prompts: preset.prompts.map((prompt) =>
                prompt.id === promptId ? { ...prompt, ...nextPrompt } : prompt,
            ),
        }));
    }

    function updateGeneration(nextGeneration: PresetGenerationSettings) {
        updateActivePreset((preset) => ({
            ...preset,
            generation: Object.keys(nextGeneration).length ? nextGeneration : undefined,
        }));
    }

    function updateOrderEntry(promptId: string, enabled: boolean) {
        updateActivePreset((preset) => ({
            ...preset,
            promptOrder: preset.promptOrder.map((entry) =>
                entry.promptId === promptId ? { ...entry, enabled } : entry,
            ),
        }));
    }

    function addPrompt() {
        const prompt = createBlankPrompt();
        updateActivePreset((preset) => ({
            ...preset,
            prompts: [...preset.prompts, prompt],
            promptOrder: [...preset.promptOrder, { promptId: prompt.id, enabled: true }],
        }));
        setSelectedPromptId(prompt.id);
    }

    function addPresetFromDefault() {
        const presetNumber = collection.presets.length + 1;
        const preset = createPresetFromDefault(`New preset ${presetNumber}`);
        const nextCollection = normalizePresetCollection({
            activePresetId: preset.id,
            presets: [...collection.presets, preset],
        });

        onCollectionChange(nextCollection);
        setSelectedPromptId(preset.promptOrder[0]?.promptId ?? "");
        setStatusMessage("Created preset from Default.");
        setRequestState("success");
    }

    function deleteActivePreset() {
        if (!activePreset) {
            return;
        }

        setConfirmAction({
            title: "Delete preset?",
            message: `Delete "${activePreset.title}" from userData/presets/presets.json after autosave? This will not delete chats or characters.`,
            details:
                collection.presets.length <= 1
                    ? [
                          "This is the last preset, so SmileyChat will recreate the default preset after deletion.",
                      ]
                    : undefined,
            confirmLabel: "Delete",
            onConfirm: () => {
                const remainingPresets = collection.presets.filter(
                    (preset) => preset.id !== activePreset.id,
                );
                const nextCollection = normalizePresetCollection({
                    activePresetId: remainingPresets[0]?.id ?? "",
                    presets: remainingPresets,
                });

                onCollectionChange(nextCollection);
                setSelectedPromptId(
                    nextCollection.presets[0]?.promptOrder[0]?.promptId ?? "",
                );
                setStatusMessage(`Deleted preset "${activePreset.title}".`);
                setRequestState("success");
            },
        });
    }

    function deleteSelectedPrompt() {
        if (!selectedPromptId || !selectedPrompt) {
            return;
        }

        setConfirmAction({
            title: "Delete prompt?",
            message: `Delete "${selectedPrompt.title}" from this preset?`,
            details: warningsForPromptDeletion(selectedPrompt),
            confirmLabel: "Delete",
            onConfirm: () => {
                const selectedIndex = orderedPrompts.findIndex(
                    ({ prompt }) => prompt.id === selectedPromptId,
                );
                const nextSelectedPromptId =
                    orderedPrompts[selectedIndex + 1]?.prompt.id ??
                    orderedPrompts[selectedIndex - 1]?.prompt.id ??
                    "";

                updateActivePreset((preset) => ({
                    ...preset,
                    prompts: preset.prompts.filter(
                        (prompt) => prompt.id !== selectedPromptId,
                    ),
                    promptOrder: preset.promptOrder.filter(
                        (entry) => entry.promptId !== selectedPromptId,
                    ),
                }));
                setSelectedPromptId(nextSelectedPromptId);
            },
        });
    }

    function movePrompt(promptId: string, direction: -1 | 1) {
        updateActivePreset((preset) => {
            const index = preset.promptOrder.findIndex(
                (entry) => entry.promptId === promptId,
            );
            const nextIndex = index + direction;

            if (index < 0 || nextIndex < 0 || nextIndex >= preset.promptOrder.length) {
                return preset;
            }

            const promptOrder = [...preset.promptOrder];
            const [entry] = promptOrder.splice(index, 1);
            promptOrder.splice(nextIndex, 0, entry);

            return {
                ...preset,
                promptOrder,
            };
        });
    }

    function reorderPrompt(promptId: string, targetPromptId: string) {
        updateActivePreset((preset) => {
            const sourceIndex = preset.promptOrder.findIndex(
                (entry) => entry.promptId === promptId,
            );
            const targetIndex = preset.promptOrder.findIndex(
                (entry) => entry.promptId === targetPromptId,
            );

            if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
                return preset;
            }

            const promptOrder = [...preset.promptOrder];
            const [entry] = promptOrder.splice(sourceIndex, 1);
            promptOrder.splice(targetIndex, 0, entry);

            return {
                ...preset,
                promptOrder,
            };
        });
    }

    return (
        <section className="tool-window presets-settings">
            <h2>Preset</h2>
            <div className="preset-toolbar">
                <label>
                    Active preset
                    <select
                        value={collection.activePresetId}
                        onInput={(event) =>
                            updateCollection({
                                ...collection,
                                activePresetId: (event.currentTarget as HTMLSelectElement)
                                    .value,
                            })
                        }
                    >
                        {collection.presets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.title}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="button-row">
                    <button
                        type="button"
                        disabled={requestState === "loading"}
                        onClick={addPresetFromDefault}
                    >
                        <Plus size={16} />
                        New
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={16} />
                        Import
                    </button>
                    <button type="button" onClick={exportActivePreset}>
                        <Download size={16} />
                        Export
                    </button>
                    <button
                        className="danger-button"
                        type="button"
                        onClick={deleteActivePreset}
                    >
                        <Trash size={16} />
                        Delete
                    </button>
                </div>
            </div>

            <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                    const file = (event.currentTarget as HTMLInputElement).files?.[0];

                    if (file) {
                        void importPresetFile(file);
                    }
                }}
            />

            {activePreset && (
                <>
                    <label>
                        Preset title
                        <input
                            value={activePreset.title}
                            onInput={(event) =>
                                updateActivePreset((preset) => ({
                                    ...preset,
                                    title: (event.currentTarget as HTMLInputElement)
                                        .value,
                                }))
                            }
                        />
                    </label>

                    <div
                        className="preset-subnav"
                        role="tablist"
                        aria-label="Preset view"
                    >
                        <button
                            className={activeView === "editor" ? "active" : ""}
                            type="button"
                            onClick={() => setActiveView("editor")}
                        >
                            <FilePenLine size={16} />
                            Editor
                        </button>
                        <button
                            className={activeView === "generation" ? "active" : ""}
                            type="button"
                            onClick={() => setActiveView("generation")}
                        >
                            <SlidersHorizontal size={16} />
                            Generation
                        </button>
                        <button
                            className={activeView === "preview" ? "active" : ""}
                            type="button"
                            onClick={() => setActiveView("preview")}
                        >
                            <Eye size={16} />
                            Preview
                        </button>
                    </div>

                    {presetWarnings.length > 0 && (
                        <div className="preset-warning-list" role="status">
                            {presetWarnings.map((warning) => (
                                <p key={warning}>
                                    <AlertTriangle size={15} />
                                    {warning}
                                </p>
                            ))}
                        </div>
                    )}

                    {activeView === "editor" && (
                        <PresetEditor
                            orderedPrompts={orderedPrompts}
                            selectedPrompt={selectedPrompt}
                            selectedPromptId={selectedPromptId}
                            selectedPromptOrderEntry={selectedPromptOrderEntry}
                            onAddPrompt={addPrompt}
                            onDeleteSelectedPrompt={deleteSelectedPrompt}
                            onMovePrompt={movePrompt}
                            onReorderPrompt={reorderPrompt}
                            onSelectPrompt={setSelectedPromptId}
                            onUpdateOrderEntry={updateOrderEntry}
                            onUpdatePrompt={updatePrompt}
                        />
                    )}

                    {activeView === "generation" && (
                        <PresetGenerationEditor
                            generation={activePreset.generation}
                            warnings={generationWarnings}
                            onChange={updateGeneration}
                        />
                    )}

                    {activeView === "preview" && (
                        <PresetPreview
                            compiledContextPreview={compiledContextPreview}
                            compiledMessagesPreview={compiledMessagesPreview}
                            requestState={requestState}
                        />
                    )}
                </>
            )}

            {statusMessage && (
                <p className={`connection-status ${requestState}`}>{statusMessage}</p>
            )}

            {confirmAction && (
                <PresetConfirmDialog
                    action={confirmAction}
                    onClose={() => setConfirmAction(undefined)}
                />
            )}
        </section>
    );
}

type PresetGenerationEditorProps = {
    generation: PresetGenerationSettings | undefined;
    warnings: string[];
    onChange: (generation: PresetGenerationSettings) => void;
};

function PresetGenerationEditor({
    generation,
    warnings,
    onChange,
}: PresetGenerationEditorProps) {
    const settings = generation ?? {};

    function updateNumber(
        key: keyof PresetGenerationSettings,
        value: string,
        options: { integer?: boolean } = {},
    ) {
        const next = { ...settings };

        if (!value.trim()) {
            delete next[key];
            onChange(next);
            return;
        }

        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return;
        }

        next[key] = (options.integer ? Math.trunc(parsed) : parsed) as never;
        onChange(next);
    }

    function updateStopSequences(value: string) {
        const stopSequences = Array.from(
            new Set(
                value
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
            ),
        );
        const next = { ...settings };

        if (stopSequences.length) {
            next.stopSequences = stopSequences;
        } else {
            delete next.stopSequences;
        }

        onChange(next);
    }

    return (
        <section className="preset-generation-panel" aria-label="Generation settings">
            <div className="preset-section-header">
                <h3>Generation</h3>
                <button type="button" onClick={() => onChange({})}>
                    Clear
                </button>
            </div>
            <p className="field-hint">
                Empty fields use the active provider or model default. SmileyChat sends
                only the settings supported by the selected provider.
            </p>
            {warnings.length > 0 && (
                <div className="preset-warning-list" role="status">
                    {warnings.map((warning) => (
                        <p key={warning}>
                            <AlertTriangle size={15} />
                            {warning}
                        </p>
                    ))}
                </div>
            )}
            <div className="preset-generation-grid">
                <GenerationNumberField
                    label="Temperature"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.temperature}
                    onInput={(value) => updateNumber("temperature", value)}
                />
                <GenerationNumberField
                    label="Top P"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.topP}
                    onInput={(value) => updateNumber("topP", value)}
                />
                <GenerationNumberField
                    label="Top K"
                    min={0}
                    step={1}
                    value={settings.topK}
                    onInput={(value) => updateNumber("topK", value, { integer: true })}
                />
                <GenerationNumberField
                    label="Min P"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.minP}
                    onInput={(value) => updateNumber("minP", value)}
                />
                <GenerationNumberField
                    label="Top A"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.topA}
                    onInput={(value) => updateNumber("topA", value)}
                />
                <GenerationNumberField
                    label="Presence penalty"
                    min={-2}
                    max={2}
                    step={0.05}
                    value={settings.presencePenalty}
                    onInput={(value) => updateNumber("presencePenalty", value)}
                />
                <GenerationNumberField
                    label="Frequency penalty"
                    min={-2}
                    max={2}
                    step={0.05}
                    value={settings.frequencyPenalty}
                    onInput={(value) => updateNumber("frequencyPenalty", value)}
                />
                <GenerationNumberField
                    label="Repetition penalty"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.repetitionPenalty}
                    onInput={(value) => updateNumber("repetitionPenalty", value)}
                />
                <GenerationNumberField
                    label="Seed"
                    step={1}
                    value={settings.seed}
                    onInput={(value) => updateNumber("seed", value, { integer: true })}
                />
            </div>
            <label>
                Stop sequences
                <textarea
                    className="preset-stop-sequences"
                    placeholder="One sequence per line"
                    value={settings.stopSequences?.join("\n") ?? ""}
                    onInput={(event) =>
                        updateStopSequences(
                            (event.currentTarget as HTMLTextAreaElement).value,
                        )
                    }
                />
            </label>
        </section>
    );
}

type GenerationNumberFieldProps = {
    label: string;
    max?: number;
    min?: number;
    step?: number;
    value: number | undefined;
    onInput: (value: string) => void;
};

function GenerationNumberField({
    label,
    max,
    min,
    step,
    value,
    onInput,
}: GenerationNumberFieldProps) {
    return (
        <label>
            {label}
            <input
                max={max}
                min={min}
                step={step}
                type="number"
                value={value ?? ""}
                onInput={(event) =>
                    onInput((event.currentTarget as HTMLInputElement).value)
                }
            />
        </label>
    );
}

function collectGenerationWarnings(
    generation: PresetGenerationSettings | undefined,
    connectionSettings: ConnectionSettings,
) {
    const profile = getActiveConnectionProfile(connectionSettings);
    const warnings: string[] = [];

    if (!profile || !generation) {
        return warnings;
    }

    if (
        profile.provider === "openai-compatible" &&
        (generation.topK !== undefined ||
            generation.minP !== undefined ||
            generation.topA !== undefined ||
            generation.repetitionPenalty !== undefined)
    ) {
        warnings.push(
            "OpenAI-compatible Chat Completions does not use Top K, Min P, Top A, or Repetition penalty. Those fields will be omitted.",
        );
    }

    if (profile.provider === "openrouter") {
        warnings.push(
            "OpenRouter support is model-specific. Unsupported sampler fields are omitted when model metadata exposes supported parameters.",
        );
    }

    if (profile.provider === "google-ai" && generation.topK !== undefined) {
        warnings.push(
            "Google AI Top K support depends on the selected Gemini model. If the model does not allow Top K, the request may fail.",
        );
    }

    if (
        profile.provider === "xai" &&
        (generation.topK !== undefined ||
            generation.minP !== undefined ||
            generation.topA !== undefined ||
            generation.repetitionPenalty !== undefined)
    ) {
        warnings.push(
            "xAI Chat Completions does not use Top K, Min P, Top A, or Repetition penalty. Those fields will be omitted.",
        );
    }

    if (profile.provider === "xai") {
        const reasoning = (profile.config as Record<string, unknown>)["reasoning"];

        if (
            isRecord(reasoning) &&
            reasoning.enabled === true &&
            (generation.presencePenalty !== undefined ||
                generation.frequencyPenalty !== undefined ||
                generation.stopSequences?.length)
        ) {
            warnings.push(
                "xAI reasoning models reject presence penalty, frequency penalty, and stop sequences when reasoning effort is active. Those fields will be omitted.",
            );
        }
    }

    if (profile.provider === "anthropic") {
        const modelId = isRecord(profile.config.model)
            ? String(profile.config.model.id ?? "")
            : "";

        if (
            isClaudeOpus47OrLaterModel(modelId) &&
            (generation.temperature !== undefined ||
                generation.topP !== undefined ||
                generation.topK !== undefined)
        ) {
            warnings.push(
                "Claude Opus 4.7 and later reject non-default temperature, Top P, and Top K. SmileyChat will omit them.",
            );
        } else if (
            generation.temperature !== undefined &&
            generation.topP !== undefined
        ) {
            warnings.push(
                "Anthropic Messages requests should not send temperature and Top P together. SmileyChat will send temperature and omit Top P.",
            );
        }
    }

    return warnings;
}
