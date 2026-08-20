import {
    AlertTriangle,
    CheckCircle2,
    Download,
    Eye,
    FilePenLine,
    LoaderCircle,
    Plus,
    SlidersHorizontal,
    TextQuote,
    Trash,
    Upload,
} from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { saveInstructTemplate } from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import { isRecord } from "#frontend/lib/common/guards";
import { createId } from "#frontend/lib/common/ids";
import {
    getActiveConnectionProfile,
    isNovelAIProfile,
    type ConnectionSettings,
} from "#frontend/lib/connections/config";
import { isClaudeOpus47OrLaterModel } from "#frontend/lib/connections/generation-settings";
import { usesNovelAITextGenerationApi } from "#frontend/lib/connections/novelai/constants";
import { parseInstructTemplateJson } from "#frontend/lib/instruct";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import type {
    PresetFormattingSettings,
    PresetGenerationSettings,
} from "#frontend/lib/presets/types";
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
import { DeferredNumberInput } from "./deferred-number-input";

import {
    PresetConfirmDialog,
    type PresetConfirmAction,
} from "./presets/preset-confirm-dialog";
import { PresetEditor, type OrderedPrompt } from "./presets/preset-editor";
import { PresetPreview } from "./presets/preset-preview";
import {
    collectPresetWarnings,
    collectSelectedPromptWarnings,
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
    preferences?: AppPreferences;
    onPreferencesChange?: (preferences: AppPreferences) => void;
    streamingFallback: boolean;
    userStatus: UserStatus;
};

type PresetPanelView = "editor" | "generation" | "preview";
type PresetPreviewView = "compiled" | "flat";

export function PresetSettings({
    character,
    connectionSettings,
    collection,
    loadError,
    messages,
    mode,
    onCollectionChange,
    persona,
    preferences,
    onPreferencesChange,
    streamingFallback,
    userStatus,
}: PresetSettingsProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedPromptId, setSelectedPromptId] = useState("");
    const [activeView, setActiveView] = useState<PresetPanelView>("editor");
    const [activePreviewView, setActivePreviewView] =
        useState<PresetPreviewView>("compiled");
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
    const activeConnectionProfile = getActiveConnectionProfile(connectionSettings);
    const isTextCompletionProvider =
        activeConnectionProfile?.provider === "koboldcpp" ||
        (isNovelAIProfile(activeConnectionProfile) &&
            usesNovelAITextGenerationApi(activeConnectionProfile.config.model.id));

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
    const presetWarnings = useMemo(
        () => collectPresetWarnings(activePreset),
        [activePreset],
    );
    const selectedPromptWarnings = useMemo(
        () => collectSelectedPromptWarnings(selectedPrompt),
        [selectedPrompt],
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

            // If the imported preset includes custom instruct formatting, register it to userData/instruct
            if (isRecord(raw)) {
                try {
                    const parsedInstruct = parseInstructTemplateJson(raw);
                    if (
                        parsedInstruct.formatting.instructTemplate === "custom" ||
                        parsedInstruct.template.userPrefix ||
                        parsedInstruct.template.assistantSuffix ||
                        parsedInstruct.template.storyString
                    ) {
                        const id = createId("instruct");
                        const saved = await saveInstructTemplate({
                            ...parsedInstruct.template,
                            id,
                        });
                        if (onPreferencesChange && preferences) {
                            onPreferencesChange({
                                ...preferences,
                                formatting: {
                                    activeTemplateId: `custom:${saved.template.id}`,
                                    settings: {
                                        ...parsedInstruct.formatting,
                                        instructTemplate: "custom",
                                    } as PresetFormattingSettings,
                                },
                            });
                        }
                    }
                } catch {
                    // Ignore non-instruct json parsing
                }
            }

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
        onCollectionChange(nextCollection);
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

                    <div className="preset-subnav-row">
                        <div
                            className="preset-subnav"
                            role="tablist"
                            aria-label="Preset view"
                        >
                            <button
                                className={activeView === "editor" ? "active" : ""}
                                type="button"
                                role="tab"
                                aria-selected={activeView === "editor"}
                                onClick={() => setActiveView("editor")}
                            >
                                <FilePenLine size={16} />
                                Editor
                            </button>
                            <button
                                className={activeView === "generation" ? "active" : ""}
                                type="button"
                                role="tab"
                                aria-selected={activeView === "generation"}
                                onClick={() => setActiveView("generation")}
                            >
                                <SlidersHorizontal size={16} />
                                Generation
                            </button>
                            <button
                                className={activeView === "preview" ? "active" : ""}
                                type="button"
                                role="tab"
                                aria-selected={activeView === "preview"}
                                onClick={() => setActiveView("preview")}
                            >
                                <Eye size={16} />
                                Preview
                            </button>
                        </div>

                        <div className="preset-tab-status">
                            {activeView === "preview" && (
                                <div
                                    className="preset-preview-subnav"
                                    role="tablist"
                                    aria-label="Preview format"
                                >
                                    <button
                                        className={
                                            activePreviewView === "compiled"
                                                ? "active"
                                                : ""
                                        }
                                        type="button"
                                        role="tab"
                                        aria-selected={activePreviewView === "compiled"}
                                        onClick={() => setActivePreviewView("compiled")}
                                    >
                                        Compiled
                                    </button>
                                    <button
                                        className={
                                            activePreviewView === "flat" ? "active" : ""
                                        }
                                        type="button"
                                        role="tab"
                                        aria-selected={activePreviewView === "flat"}
                                        onClick={() => setActivePreviewView("flat")}
                                    >
                                        Flat
                                    </button>
                                </div>
                            )}
                            {activeView === "editor" &&
                                selectedPromptWarnings.map((warning) => (
                                    <span
                                        className="preset-warning-badge"
                                        key={warning}
                                        role="status"
                                        title={warning}
                                    >
                                        <AlertTriangle aria-hidden="true" size={14} />
                                        {warning}
                                    </span>
                                ))}
                            {(requestState === "loading" ||
                                requestState === "success") && (
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
                            )}
                        </div>
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
                        <div>
                            {isTextCompletionProvider && (
                                <div
                                    className="preset-text-completion-banner"
                                    role="status"
                                >
                                    <AlertTriangle size={18} />
                                    <div>
                                        <strong className="preset-text-completion-banner-title">
                                            Text Completion provider active (
                                            {activeConnectionProfile?.name ||
                                                "Text Completion"}
                                            )
                                        </strong>
                                        <p>
                                            By default, prompts are assembled using the
                                            Formatter's <strong>Story String</strong> and
                                            instruct turn tokens.
                                        </p>
                                        <label
                                            className="checkbox-field"
                                            style={{
                                                marginTop: "6px",
                                                display: "inline-flex",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={
                                                    preferences?.formatting.settings
                                                        .overridePresetPromptOrder ===
                                                    true
                                                }
                                                onChange={(event) => {
                                                    if (
                                                        onPreferencesChange &&
                                                        preferences
                                                    ) {
                                                        onPreferencesChange({
                                                            ...preferences,
                                                            formatting: {
                                                                ...preferences.formatting,
                                                                settings: {
                                                                    ...preferences
                                                                        .formatting
                                                                        .settings,
                                                                    overridePresetPromptOrder:
                                                                        (
                                                                            event.currentTarget as HTMLInputElement
                                                                        ).checked,
                                                                },
                                                            },
                                                        });
                                                    }
                                                }}
                                            />
                                            <span style={{ fontSize: "0.83rem" }}>
                                                Override Formatter with Preset Prompt
                                                Order (Advanced)
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}
                            <div
                                className={
                                    isTextCompletionProvider &&
                                    preferences?.formatting.settings
                                        .overridePresetPromptOrder !== true
                                        ? "preset-editor-dimmed"
                                        : ""
                                }
                            >
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
                            </div>
                        </div>
                    )}

                    {activeView === "generation" && (
                        <PresetGenerationEditor
                            generation={activePreset.generation}
                            streamingFallback={streamingFallback}
                            warnings={generationWarnings}
                            onChange={updateGeneration}
                        />
                    )}

                    {activeView === "preview" && (
                        <PresetPreview
                            activeView={activePreviewView}
                            preset={activePreset}
                            character={character}
                            messages={messages}
                            mode={mode}
                            personaDescription={persona.description}
                            personaName={persona.name}
                            userStatus={userStatus}
                        />
                    )}
                </>
            )}

            {requestState === "error" && statusMessage && (
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
    streamingFallback: boolean;
    warnings: string[];
    onChange: (generation: PresetGenerationSettings) => void;
};

function PresetGenerationEditor({
    generation,
    streamingFallback,
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
            new Set(value.split("\n").filter((item) => item.length > 0)),
        );
        const next = { ...settings };

        if (stopSequences.length) {
            next.stopSequences = stopSequences;
        } else {
            delete next.stopSequences;
        }

        onChange(next);
    }

    function updateStreaming(value: string) {
        const next = { ...settings };

        if (value === "default") {
            delete next.streaming;
        } else {
            next.streaming = value === "enabled";
        }

        onChange(next);
    }

    function updateSamplerOrder(value: string) {
        const samplerOrder = value
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isInteger(item));
        const next = { ...settings };
        if (samplerOrder.length) next.samplerOrder = samplerOrder;
        else delete next.samplerOrder;
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
            <div className="preset-generation-card">
                <h4>Core sampling</h4>
                <div className="preset-generation-grid">
                    <label title="Stream responses in real-time token-by-token instead of waiting for the full message.">
                        Stream responses
                        <select
                            value={
                                settings.streaming === undefined
                                    ? "default"
                                    : settings.streaming
                                      ? "enabled"
                                      : "disabled"
                            }
                            onChange={(event) =>
                                updateStreaming(
                                    (event.currentTarget as HTMLSelectElement).value,
                                )
                            }
                        >
                            <option value="default">
                                Use global default (
                                {streamingFallback ? "enabled" : "disabled"})
                            </option>
                            <option value="enabled">Enabled</option>
                            <option value="disabled">Disabled</option>
                        </select>
                    </label>
                    <GenerationNumberField
                        label="Temperature"
                        title="Controls randomness. Lower values are more deterministic and focused; higher values are more creative and diverse."
                        min={0}
                        max={2}
                        step={0.05}
                        value={settings.temperature}
                        onInput={(value) => updateNumber("temperature", value)}
                    />
                    <GenerationNumberField
                        label="Top P"
                        title="Top-P (Nucleus) sampling: Considers only tokens within the top cumulative probability mass."
                        min={0}
                        max={1}
                        step={0.01}
                        value={settings.topP}
                        onInput={(value) => updateNumber("topP", value)}
                    />
                    <GenerationNumberField
                        label="Top K"
                        title="Top-K sampling: Limits the selection pool to the K most probable next tokens."
                        min={0}
                        step={1}
                        value={settings.topK}
                        onInput={(value) =>
                            updateNumber("topK", value, { integer: true })
                        }
                    />
                    <GenerationNumberField
                        label="Min P"
                        title="Min-P sampling: Discards tokens whose probability is lower than Min P multiplied by the probability of the most likely token."
                        min={0}
                        max={1}
                        step={0.01}
                        value={settings.minP}
                        onInput={(value) => updateNumber("minP", value)}
                    />
                    <GenerationNumberField
                        label="Top A"
                        title="Top-A sampling: Dynamically truncates token pool based on the highest probability token squared."
                        min={0}
                        max={1}
                        step={0.01}
                        value={settings.topA}
                        onInput={(value) => updateNumber("topA", value)}
                    />
                    <GenerationNumberField
                        label="Presence penalty"
                        title="Penalizes tokens that have already appeared in the text, encouraging the introduction of new topics."
                        min={-2}
                        max={2}
                        step={0.05}
                        value={settings.presencePenalty}
                        onInput={(value) => updateNumber("presencePenalty", value)}
                    />
                    <GenerationNumberField
                        label="Frequency penalty"
                        title="Penalizes tokens based on how often they have appeared in the text, discouraging word repetition."
                        min={-2}
                        max={2}
                        step={0.05}
                        value={settings.frequencyPenalty}
                        onInput={(value) => updateNumber("frequencyPenalty", value)}
                    />
                    <GenerationNumberField
                        label="Repetition penalty"
                        title="Applies an exponential penalty to tokens that have already appeared in the context window."
                        min={0}
                        max={2}
                        step={0.05}
                        value={settings.repetitionPenalty}
                        onInput={(value) => updateNumber("repetitionPenalty", value)}
                    />
                    <GenerationNumberField
                        label="Seed"
                        title="Random seed for generation. Using the same seed with identical parameters reproduces deterministic output."
                        step={1}
                        value={settings.seed}
                        onInput={(value) =>
                            updateNumber("seed", value, { integer: true })
                        }
                    />
                </div>
            </div>

            <div className="preset-generation-card">
                <h4>Advanced repetition & DRY</h4>
                <div className="preset-generation-grid">
                    <GenerationNumberField
                        label="Rep penalty range"
                        title="Number of previous tokens to consider when calculating repetition penalty (0 = entire context window)."
                        min={0}
                        step={1}
                        value={settings.repetitionPenaltyRange}
                        onInput={(value) =>
                            updateNumber("repetitionPenaltyRange", value, {
                                integer: true,
                            })
                        }
                    />
                    <GenerationNumberField
                        label="DRY multiplier"
                        title="DRY (Don't Repeat Yourself) penalty multiplier applied to matching n-gram phrases."
                        min={0}
                        step={0.01}
                        value={settings.dryMultiplier}
                        onInput={(value) => updateNumber("dryMultiplier", value)}
                    />
                    <GenerationNumberField
                        label="DRY base"
                        title="Base exponent for DRY penalty scaling as matching phrase length grows."
                        min={1}
                        step={0.01}
                        value={settings.dryBase}
                        onInput={(value) => updateNumber("dryBase", value)}
                    />
                    <GenerationNumberField
                        label="DRY allowed length"
                        title="Maximum number of repeated tokens allowed before DRY penalty begins."
                        min={0}
                        step={1}
                        value={settings.dryAllowedLength}
                        onInput={(value) =>
                            updateNumber("dryAllowedLength", value, { integer: true })
                        }
                    />
                    <GenerationNumberField
                        label="DRY penalty last N"
                        title="Maximum number of recent tokens checked for repeated phrase structures (0 = entire context)."
                        min={0}
                        step={1}
                        value={settings.dryPenaltyLastN}
                        onInput={(value) =>
                            updateNumber("dryPenaltyLastN", value, { integer: true })
                        }
                    />
                </div>
            </div>

            <div className="preset-generation-card">
                <h4>XTC & Mirostat</h4>
                <div className="preset-generation-grid">
                    <GenerationNumberField
                        label="XTC threshold"
                        title="Exclude Top Candidates (XTC) threshold: Tokens above this probability may be excluded to encourage creative word choices."
                        min={0}
                        max={1}
                        step={0.01}
                        value={settings.xtcThreshold}
                        onInput={(value) => updateNumber("xtcThreshold", value)}
                    />
                    <GenerationNumberField
                        label="XTC probability"
                        title="Chance (0-1) of applying the XTC filter when candidates exceed the threshold."
                        min={0}
                        max={1}
                        step={0.01}
                        value={settings.xtcProbability}
                        onInput={(value) => updateNumber("xtcProbability", value)}
                    />
                    <GenerationNumberField
                        label="Mirostat mode"
                        title="Mirostat sampling algorithm (0 = disabled, 1 = Mirostat v1, 2 = Mirostat v2) that dynamically targets a specific perplexity level."
                        min={0}
                        step={1}
                        value={settings.mirostatMode}
                        onInput={(value) =>
                            updateNumber("mirostatMode", value, { integer: true })
                        }
                    />
                    <GenerationNumberField
                        label="Mirostat tau"
                        title="Target entropy (perplexity) for Mirostat sampling. Higher values yield more varied vocabulary."
                        min={0}
                        step={0.1}
                        value={settings.mirostatTau}
                        onInput={(value) => updateNumber("mirostatTau", value)}
                    />
                    <GenerationNumberField
                        label="Mirostat eta"
                        title="Learning rate for Mirostat entropy adjustment per generated token."
                        min={0}
                        step={0.01}
                        value={settings.mirostatEta}
                        onInput={(value) => updateNumber("mirostatEta", value)}
                    />
                </div>
            </div>

            <div className="preset-generation-card">
                <h4>Stop sequences & provider samplers</h4>
                <label title="Stop sequences: Generation stops immediately upon encountering any of these strings (one per line).">
                    Stop sequences
                    <StopSequencesTextarea
                        value={settings.stopSequences}
                        onChange={updateStopSequences}
                    />
                </label>
                <label title="Custom numeric sampler pipeline order sent exclusively to KoboldCPP (e.g. 6, 0, 1, 3, 4, 2, 5).">
                    KoboldCPP sampler order
                    <input
                        value={settings.samplerOrder?.join(", ") ?? ""}
                        placeholder="6, 0, 1, 3, 4, 2, 5"
                        onInput={(event) => updateSamplerOrder(event.currentTarget.value)}
                    />
                    <span className="field-hint">
                        Optional numeric sampler order, sent only to KoboldCPP.
                    </span>
                </label>
            </div>
        </section>
    );
}

function StopSequencesTextarea({
    value,
    onChange,
}: {
    value: string[] | undefined;
    onChange: (value: string) => void;
}) {
    const canonical = value?.join("\n") ?? "";
    const [draft, setDraft] = useState(canonical);
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) {
            setDraft(canonical);
        }
    }, [canonical, focused]);

    return (
        <textarea
            className="preset-stop-sequences"
            placeholder="One sequence per line"
            value={draft}
            onFocus={() => setFocused(true)}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
                setFocused(false);
                onChange(draft);
            }}
        />
    );
}

type GenerationNumberFieldProps = {
    label: string;
    max?: number;
    min?: number;
    step?: number;
    title?: string;
    value: number | undefined;
    onInput: (value: string) => void;
};

function GenerationNumberField({
    label,
    max,
    min,
    step,
    title,
    value,
    onInput,
}: GenerationNumberFieldProps) {
    return (
        <label title={title}>
            {label}
            <DeferredNumberInput
                max={max}
                min={min}
                step={step}
                value={value}
                optional
                integer={step === 1}
                onCommit={(nextValue) =>
                    onInput(nextValue === undefined ? "" : String(nextValue))
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

        if (isClaudeOpus47OrLaterModel(modelId)) {
            const hasInvalidTemp =
                generation.temperature !== undefined && generation.temperature !== 1.0;
            const hasInvalidTopK = generation.topK !== undefined;
            const hasInvalidTopP =
                generation.topP !== undefined && generation.topP < 0.99;

            if (hasInvalidTemp || hasInvalidTopK || hasInvalidTopP) {
                warnings.push(
                    "Models released after Claude Opus 4.6 do not support top_k, temperature (except 1.0), or top_p (except >= 0.99). Incompatible values will be omitted.",
                );
            }
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
