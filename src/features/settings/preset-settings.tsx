import {
    AlertTriangle,
    Download,
    Eye,
    FilePenLine,
    Plus,
    Trash,
    Upload,
} from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { messageFromError } from "#frontend/lib/common/errors";
import { isRecord } from "#frontend/lib/common/guards";
import { createId } from "#frontend/lib/common/ids";
import {
    compilePresetContext,
    compilePresetMessages,
} from "#frontend/lib/presets/compile";
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
    ScyllaPreset,
} from "#frontend/lib/presets/types";
import type {
    ChatMode,
    Message,
    ScyllaCharacter,
    ScyllaPersona,
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
    character: ScyllaCharacter;
    collection: PresetCollection;
    loadError?: string;
    messages: Message[];
    mode: ChatMode;
    onCollectionChange: (collection: PresetCollection) => void;
    persona: ScyllaPersona;
    userStatus: UserStatus;
};

type PresetPanelView = "editor" | "preview";

export function PresetSettings({
    character,
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
            const isScyllaPreset = isRecord(raw) && Array.isArray(raw.promptOrder);
            const imported = isScyllaPreset
                ? (() => {
                      const preset = normalizePreset(raw);

                      return {
                          preset: {
                              ...preset,
                              id: createId("preset"),
                          },
                          status: "Imported ScyllaChat preset.",
                      };
                  })()
                : (() => {
                      const { preset, summary } = importSillyTavernPreset(
                          raw,
                          file.name.replace(/\.json$/i, ""),
                      );

                      return {
                          preset,
                          status: `Imported ${summary.importedPrompts} prompt(s), ${summary.enabledPrompts} enabled. Ignored ${summary.ignoredFields.length} generation field(s).`,
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
        link.download = `${activePreset.title || "preset"}.scylla-preset.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function updateCollection(nextCollection: PresetCollection) {
        onCollectionChange(normalizePresetCollection(nextCollection));
    }

    function updateActivePreset(updater: (preset: ScyllaPreset) => ScyllaPreset) {
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
                          "This is the last preset, so ScyllaChat will recreate the default preset after deletion.",
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
        <section className="tool-window">
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
