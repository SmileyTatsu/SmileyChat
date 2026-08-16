import {
    Download,
    FilePlus2,
    FileText,
    Plus,
    Trash2,
    Upload,
    Sparkles,
    ChevronDown,
    ChevronUp,
} from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import defaultInstructTemplates from "#frontend/data/default-instruct-templates";
import {
    deleteInstructTemplate,
    loadInstructTemplates,
    saveInstructTemplate,
} from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import { isRecord } from "#frontend/lib/common/guards";
import { createId } from "#frontend/lib/common/ids";
import {
    defaultStoryString,
    formatCustomInstructPrompt,
    formatInstructPrompt,
    parseInstructTemplateJson,
    slugifyInstructName,
    type CustomInstructTemplate,
} from "#frontend/lib/instruct";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import {
    importSillyTavernPreset,
    normalizePresetCollection,
} from "#frontend/lib/presets/normalize";
import type {
    PresetCollection,
    PresetFormattingSettings,
} from "#frontend/lib/presets/types";
import { MessageRole, type Message, type SmileyCharacter } from "#frontend/types";

type FormattingSettingsProps = {
    character: SmileyCharacter;
    messages: Message[];
    preferences: AppPreferences;
    onPreferencesChange: (preferences: AppPreferences) => void;
    presetCollection?: PresetCollection;
    onPresetCollectionChange?: (collection: PresetCollection) => void;
};

const standardBuiltInTemplates: CustomInstructTemplate[] = [
    {
        id: "auto",
        name: "Auto (detect from model)",
        storyString: defaultStoryString,
        sequencesAsStopStrings: true,
        namesAsStopStrings: true,
    },
    {
        id: "none",
        name: "Raw text / None",
        storyString: defaultStoryString,
    },
    ...(Array.isArray(defaultInstructTemplates)
        ? (defaultInstructTemplates as CustomInstructTemplate[]).sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          )
        : []),
];

export function FormattingSettings({
    character,
    messages,
    preferences,
    onPreferencesChange,
    presetCollection,
    onPresetCollectionChange,
}: FormattingSettingsProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importCancelRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const [templates, setTemplates] = useState<CustomInstructTemplate[]>([]);
    const [status, setStatus] = useState("");
    const [pendingImport, setPendingImport] = useState<{
        raw: Record<string, unknown>;
        fileName: string;
        parsed: ReturnType<typeof parseInstructTemplateJson>;
    } | null>(null);

    const formatting = preferences.formatting.settings;
    const activeId = preferences.formatting.activeTemplateId || "builtin:auto";
    const customTemplates = templates;

    useEffect(() => {
        void loadInstructTemplates()
            .then((result) => setTemplates(result.templates ?? []))
            .catch((error) =>
                setStatus(messageFromError(error, "Could not load saved templates.")),
            );
    }, []);

    useEffect(() => {
        if (!pendingImport) {
            previousFocusRef.current?.focus();
            previousFocusRef.current = null;
            return;
        }

        previousFocusRef.current = document.activeElement as HTMLElement | null;
        importCancelRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setPendingImport(null);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [pendingImport]);

    const activeTemplate = useMemo((): CustomInstructTemplate => {
        if (activeId.startsWith("custom:")) {
            const customId = activeId.slice(7);
            const found = templates.find((t) => t.id === customId);
            if (found) {
                return {
                    ...found,
                    ...formatting,
                    name: found.name,
                    id: found.id,
                };
            }
        }
        if (activeId.startsWith("builtin:")) {
            const builtinId = activeId.slice(8);
            const found = standardBuiltInTemplates.find((t) => t.id === builtinId);
            if (found) {
                return {
                    ...found,
                    ...formatting,
                    name: found.name,
                    id: found.id,
                };
            }
        }
        return {
            id: "custom",
            name: "Custom Template",
            storyString: defaultStoryString,
            ...formatting,
        };
    }, [activeId, formatting, templates]);

    const previewMessages = useMemo(() => {
        const charName = character?.data?.name || "Assistant";
        const userName = "User";
        const systemContent = formatting.systemPrompt
            ? formatting.systemPrompt
                  .replace(/\{\{char\}\}/gi, charName)
                  .replace(/\{\{user\}\}/gi, userName)
            : `You are ${charName}. Adhere to the roleplay scenario and stay in character.`;

        const turns = messages.length
            ? messages.slice(-4).map((message) => {
                  const swipe =
                      message.swipes[
                          "activeSwipeIndex" in message ? message.activeSwipeIndex : 0
                      ] ?? message.swipes[0];
                  const text = (swipe?.content ?? "")
                      .replace(/\{\{char\}\}/gi, charName)
                      .replace(/\{\{user\}\}/gi, userName);
                  const author =
                      formatting.alwaysAddCharacterName &&
                      message.role === MessageRole.Character
                          ? `${charName}: `
                          : "";
                  return {
                      role:
                          message.role === MessageRole.Character
                              ? ("assistant" as const)
                              : ("user" as const),
                      content: `${author}${text}`,
                  };
              })
            : [
                  {
                      role: "user" as const,
                      content: `Hello, ${charName}!`,
                  },
                  {
                      role: "assistant" as const,
                      content: `${formatting.alwaysAddCharacterName ? `${charName}: ` : ""}Greetings! How can I help you today?`,
                  },
              ];

        return [{ role: "system" as const, content: systemContent }, ...turns];
    }, [character, formatting, messages]);

    const rawPreview = useMemo(() => {
        const resolvedFormatting: PresetFormattingSettings = {
            ...formatting,
            userAlignmentMessage: formatting.userAlignmentMessage
                ? formatting.userAlignmentMessage
                      .replace(/\{\{char\}\}/gi, character?.data?.name || "Assistant")
                      .replace(/\{\{user\}\}/gi, "User")
                : undefined,
        };
        if (formatting.instructTemplate === "none") {
            return previewMessages.map((item) => item.content).join("\n\n");
        }
        if (formatting.instructTemplate === "custom") {
            return formatCustomInstructPrompt(previewMessages, resolvedFormatting);
        }
        return formatInstructPrompt(
            previewMessages,
            formatting.instructTemplate ?? "auto",
            "",
            resolvedFormatting,
        );
    }, [character, formatting, previewMessages]);

    function setFormatting(activeTemplateId: string, settings: PresetFormattingSettings) {
        onPreferencesChange({
            ...preferences,
            formatting: { activeTemplateId, settings },
        });
    }

    function selectTemplate(value: string) {
        if (value.startsWith("custom:")) {
            const template = templates.find((item) => item.id === value.slice(7));
            if (template) {
                setFormatting(value, settingsForCustomTemplate(template));
                return;
            }
        }
        if (value.startsWith("builtin:")) {
            const id = value.slice(8);
            if (id === "auto") {
                setFormatting(value, {
                    instructTemplate: "auto",
                    storyString: defaultStoryString,
                });
                return;
            }
            if (id === "none") {
                setFormatting(value, {
                    instructTemplate: "none",
                    storyString: defaultStoryString,
                });
                return;
            }
            const found = standardBuiltInTemplates.find((item) => item.id === id);
            if (found) {
                setFormatting(value, settingsForCustomTemplate(found));
                return;
            }
        }
        setFormatting(value, {
            instructTemplate: "custom",
            storyString: defaultStoryString,
        });
    }

    function updateActive(patch: Partial<CustomInstructTemplate>) {
        const next = { ...activeTemplate, ...patch };
        const nextSettings = settingsForCustomTemplate(next);
        setFormatting(activeId, nextSettings);
    }

    async function saveActiveTemplate() {
        try {
            const id = activeId.startsWith("custom:")
                ? activeTemplate.id
                : createId("instruct");
            const toSave: CustomInstructTemplate = {
                ...activeTemplate,
                id,
                name: activeTemplate.name || "Custom Template",
            };
            const result = await saveInstructTemplate(toSave);
            setTemplates(result.templates ?? []);
            setFormatting(`custom:${toSave.id}`, settingsForCustomTemplate(toSave));
            setStatus(`Saved “${toSave.name}” to userData/instruct.`);
        } catch (error) {
            setStatus(messageFromError(error, "Could not save template."));
        }
    }

    async function importTemplate(file: File) {
        try {
            const raw = JSON.parse(await file.text()) as unknown;
            const parsed = parseInstructTemplateJson(raw);
            if (
                isRecord(raw) &&
                (raw.preset || raw.prompts || raw.sysprompt || raw.context) &&
                onPresetCollectionChange &&
                presetCollection
            ) {
                setPendingImport({
                    raw,
                    fileName: file.name,
                    parsed,
                });
                return;
            }
            await finalizeInstructImport(parsed, file.name, false);
        } catch (error) {
            setStatus(messageFromError(error, "Could not import this template JSON."));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function finalizeInstructImport(
        parsed: ReturnType<typeof parseInstructTemplateJson>,
        fileName: string,
        importPreset: boolean,
        raw?: Record<string, unknown>,
    ) {
        const id = createId("instruct");
        const templateToSave = {
            ...parsed.template,
            id,
            name: parsed.name || fileName.replace(/\.json$/i, ""),
        };
        const result = await saveInstructTemplate(templateToSave);
        setTemplates(result.templates ?? []);
        setFormatting(
            `custom:${result.template.id}`,
            settingsForCustomTemplate(result.template),
        );

        if (importPreset && raw && onPresetCollectionChange && presetCollection) {
            const { preset, summary } = importSillyTavernPreset(
                raw,
                parsed.name || fileName.replace(/\.json$/i, ""),
            );
            const nextCollection = normalizePresetCollection({
                activePresetId: preset.id,
                presets: [...presetCollection.presets, preset],
            });
            onPresetCollectionChange(nextCollection);
            setStatus(
                `Imported instruct template “${result.template.name}” and preset “${preset.title}” (${summary.importedGenerationFields.length} samplers, ${summary.importedPrompts} prompts).`,
            );
        } else {
            setStatus(
                `Imported and saved “${result.template.name}” to userData/instruct.`,
            );
        }
    }

    async function deleteSelected() {
        if (!activeId.startsWith("custom:")) return;
        const customId = activeId.slice(7);
        const toDelete = templates.find((t) => t.id === customId) ?? activeTemplate;
        if (!window.confirm(`Delete “${toDelete.name}” from userData/instruct?`)) return;
        try {
            const result = await deleteInstructTemplate(customId);
            setTemplates(result.templates ?? []);
            setFormatting("builtin:auto", {
                instructTemplate: "auto",
                storyString: defaultStoryString,
            });
            setStatus(`Deleted “${toDelete.name}”.`);
        } catch (error) {
            setStatus(messageFromError(error, "Could not delete template."));
        }
    }

    function createTemplate() {
        const template: CustomInstructTemplate = {
            id: createId("instruct"),
            name: "Untitled Custom Template",
            userPrefix: "[INST] ",
            userSuffix: " [/INST]",
            assistantPrefix: "",
            assistantSuffix: "</s>",
            systemPrefix: "<s>[SYSTEM_PROMPT]",
            systemSuffix: "[/SYSTEM_PROMPT]",
            storyString: defaultStoryString,
            sequencesAsStopStrings: true,
            namesAsStopStrings: true,
            alwaysAddCharacterName: true,
        };
        setTemplates((current) => [...current, template]);
        setFormatting(`custom:${template.id}`, settingsForCustomTemplate(template));
        setStatus("New template created. Click Save Template when finished.");
    }

    function exportTemplate() {
        const toExport = {
            ...activeTemplate,
            ...formatting,
            name: activeTemplate.name,
        };
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(toExport, null, 2)], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(activeTemplate.name || "smileychat-instruct-template").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <section
            className="tool-window formatting-settings-panel"
            aria-label="Formatting settings"
        >
            <h2>
                Formatting <span className="preset-scope-badge">Beta</span>
            </h2>
            <p className="field-hint" style={{ marginTop: "-6px", marginBottom: "4px" }}>
                Beta feature. Configure model token wrappers, instruct sequences, and
                system guidelines for text-completion backends. Presets handle creative
                prompt ordering and samplers.
            </p>

            <div className="connection-profile-toolbar">
                <label>
                    Instruct template
                    <select
                        value={activeId}
                        onInput={(event) =>
                            selectTemplate(
                                (event.currentTarget as HTMLSelectElement).value,
                            )
                        }
                    >
                        <optgroup label="Standard Built-in Templates">
                            {standardBuiltInTemplates.map((item) => (
                                <option key={item.id} value={`builtin:${item.id}`}>
                                    {item.name}
                                </option>
                            ))}
                        </optgroup>
                        {customTemplates.length > 0 && (
                            <optgroup label="Custom Templates (userData/instruct)">
                                {customTemplates.map((item) => (
                                    <option key={item.id} value={`custom:${item.id}`}>
                                        {item.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </label>

                <div className="button-row">
                    <button type="button" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={16} />
                        Import
                    </button>
                    <button type="button" onClick={exportTemplate}>
                        <Download size={16} />
                        Export
                    </button>
                    <button type="button" onClick={createTemplate}>
                        <Plus size={16} />
                        New
                    </button>
                    <button
                        type="button"
                        className="danger-button"
                        disabled={!activeId.startsWith("custom:")}
                        title={
                            activeId.startsWith("custom:")
                                ? "Delete custom template"
                                : "Built-in templates cannot be deleted"
                        }
                        onClick={() => void deleteSelected()}
                    >
                        <Trash2 size={16} />
                        Delete
                    </button>
                    <input
                        ref={fileInputRef}
                        aria-label="Import template JSON"
                        hidden
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            if (file) void importTemplate(file);
                        }}
                    />
                </div>
            </div>

            {status && (
                <p className="connection-status" aria-live="polite">
                    {status}
                </p>
            )}

            <TemplateEditor
                template={activeTemplate}
                onChange={updateActive}
                onSave={() => void saveActiveTemplate()}
            />

            <section className="preset-formatting-card raw-prompt-preview">
                <div className="preset-card-header">
                    <div className="preset-card-title-group">
                        <h4>Live Raw Text Prompt Preview</h4>
                        <span className="preset-scope-badge">Text Completion</span>
                    </div>
                </div>
                <p className="field-hint">
                    Real-time prompt assembled from the active character and chat history
                    with the active instruct tokens applied.
                </p>
                <pre>
                    <code>{rawPreview}</code>
                </pre>
            </section>

            {pendingImport && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setPendingImport(null)}
                >
                    <section
                        className="message-confirm-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Preset Settings Detected"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header>
                            <Sparkles
                                size={20}
                                style={{ color: "var(--accent-color, #7aa2f7)" }}
                            />
                            <h2>Preset Settings Detected</h2>
                        </header>
                        <p>
                            “{pendingImport.fileName}” contains generation samplers
                            (temperature, DRY, min P, etc.) and roleplay context prompts
                            in addition to instruct tokens.
                        </p>
                        <p className="field-hint" style={{ marginTop: "-4px" }}>
                            Would you like to import the samplers and story context as an
                            active Preset as well?
                        </p>
                        <div
                            className="message-confirm-actions"
                            style={{ marginTop: "16px" }}
                        >
                            <button
                                ref={importCancelRef}
                                type="button"
                                onClick={() => setPendingImport(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const { parsed, fileName } = pendingImport;
                                    setPendingImport(null);
                                    void finalizeInstructImport(parsed, fileName, false);
                                }}
                            >
                                Import Instruct Only
                            </button>
                            <button
                                type="button"
                                style={{
                                    background: "var(--accent-color, #3d59a1)",
                                    color: "#fff",
                                    fontWeight: 600,
                                }}
                                onClick={() => {
                                    const { parsed, fileName, raw } = pendingImport;
                                    setPendingImport(null);
                                    void finalizeInstructImport(
                                        parsed,
                                        fileName,
                                        true,
                                        raw,
                                    );
                                }}
                            >
                                <Sparkles size={14} />
                                Import Both (Recommended)
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}

function TemplateEditor({
    template,
    onChange,
    onSave,
}: {
    template: CustomInstructTemplate;
    onChange: (patch: Partial<CustomInstructTemplate>) => void;
    onSave: () => void;
}) {
    const [showAdvanced, setShowAdvanced] = useState(
        Boolean(
            template.firstInputSequence ||
            template.lastInputSequence ||
            template.firstOutputSequence ||
            template.lastOutputSequence,
        ),
    );

    const fields: Array<[keyof CustomInstructTemplate, string, string]> = [
        ["userPrefix", "User prefix", "[INST] "],
        ["userSuffix", "User suffix", " [/INST]"],
        ["assistantPrefix", "Assistant prefix", ""],
        ["assistantSuffix", "Assistant suffix", "</s>"],
        ["systemPrefix", "System prefix", "<s>[SYSTEM_PROMPT]"],
        ["systemSuffix", "System suffix", "[/SYSTEM_PROMPT]"],
        ["exampleSeparator", "Example separator", "***"],
        ["chatStartSeparator", "Chat start separator", "***"],
    ];

    const advancedFields: Array<[keyof CustomInstructTemplate, string, string]> = [
        ["firstInputSequence", "First input sequence", ""],
        ["lastInputSequence", "Last input sequence", ""],
        ["firstOutputSequence", "First output sequence", ""],
        ["lastOutputSequence", "Last output sequence", ""],
        ["storyStringPrefix", "Story string prefix", ""],
        ["storyStringSuffix", "Story string suffix", ""],
    ];

    return (
        <section className="preset-formatting-card">
            <div className="preset-card-header">
                <div>
                    <h4>Template Editor</h4>
                    <p className="field-hint">
                        Edit tokens and turn wrappers for this template. Click Save
                        Template to store your changes.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onSave}
                    style={{ minHeight: "32px", padding: "0 14px", fontWeight: 600 }}
                >
                    <Sparkles size={14} />
                    Save Template
                </button>
            </div>

            <label>
                Template name
                <input
                    name="template-name"
                    value={template.name}
                    onInput={(event) =>
                        onChange({
                            name: (event.currentTarget as HTMLInputElement).value,
                        })
                    }
                />
            </label>

            <div className="preset-custom-sequences-grid">
                {fields.map(([key, label, placeholder]) => (
                    <label key={key}>
                        {label}
                        <input
                            name={String(key)}
                            value={(template[key] as string | undefined) ?? ""}
                            placeholder={placeholder}
                            onInput={(event) =>
                                onChange({
                                    [key]: (event.currentTarget as HTMLInputElement)
                                        .value,
                                })
                            }
                        />
                    </label>
                ))}
            </div>

            <div style={{ marginTop: "4px" }}>
                <button
                    type="button"
                    style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--accent-color, #7aa2f7)",
                        padding: "4px 0",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.85rem",
                    }}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                >
                    {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showAdvanced
                        ? "Hide advanced sequence overrides"
                        : "Show advanced sequence overrides (first/last turn overrides)"}
                </button>

                {showAdvanced && (
                    <div
                        className="preset-custom-sequences-grid"
                        style={{ marginTop: "8px" }}
                    >
                        {advancedFields.map(([key, label, placeholder]) => (
                            <label key={key}>
                                {label}
                                <input
                                    name={String(key)}
                                    value={(template[key] as string | undefined) ?? ""}
                                    placeholder={placeholder}
                                    onInput={(event) =>
                                        onChange({
                                            [key]: (
                                                event.currentTarget as HTMLInputElement
                                            ).value,
                                        })
                                    }
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="preset-toggle-row compact" style={{ marginTop: "10px" }}>
                <Toggle
                    label="Instruct sequences as stop strings"
                    value={template.sequencesAsStopStrings}
                    onChange={(value) => onChange({ sequencesAsStopStrings: value })}
                />
                <Toggle
                    label="Names as stop strings"
                    value={template.namesAsStopStrings}
                    onChange={(value) => onChange({ namesAsStopStrings: value })}
                />
                <Toggle
                    label="Always prefix character name"
                    value={template.alwaysAddCharacterName}
                    onChange={(value) => onChange({ alwaysAddCharacterName: value })}
                />
                <Toggle
                    label="Single-line mode"
                    value={template.singleLineMode}
                    onChange={(value) => onChange({ singleLineMode: value })}
                />
                <Toggle
                    label="Collapse consecutive newlines"
                    value={template.collapseConsecutiveNewlines !== false}
                    onChange={(value) => onChange({ collapseConsecutiveNewlines: value })}
                />
                <Toggle
                    label="Format system messages as user turns"
                    value={template.systemSameAsUser}
                    onChange={(value) => onChange({ systemSameAsUser: value })}
                />
                <Toggle
                    label="Wrap sequences with newlines"
                    value={template.wrapSequencesWithNewlines}
                    onChange={(value) => onChange({ wrapSequencesWithNewlines: value })}
                />
                <Toggle
                    label="Replace macros in sequences"
                    value={template.replaceMacrosInSequences}
                    onChange={(value) => onChange({ replaceMacrosInSequences: value })}
                />
                <Toggle
                    label="Skip example dialogues"
                    value={template.skipExamples}
                    onChange={(value) => onChange({ skipExamples: value })}
                />
            </div>

            <label>
                Include names
                <select
                    name="names-behavior"
                    value={template.namesBehavior ?? "force"}
                    onInput={(event) =>
                        onChange({
                            namesBehavior: (event.currentTarget as HTMLSelectElement)
                                .value as CustomInstructTemplate["namesBehavior"],
                        })
                    }
                >
                    <option value="never">Never</option>
                    <option value="force">Groups &amp; past personas</option>
                    <option value="always">Always</option>
                </select>
            </label>

            <label>
                Story string (context template)
                <textarea
                    className="story-string-textarea"
                    name="story-string"
                    style={{
                        minHeight: "150px",
                        fontFamily: "monospace",
                        fontSize: "0.84rem",
                        lineHeight: "1.4",
                    }}
                    placeholder={defaultStoryString}
                    value={template.storyString ?? defaultStoryString}
                    onInput={(event) =>
                        onChange({
                            storyString: (event.currentTarget as HTMLTextAreaElement)
                                .value,
                        })
                    }
                />
            </label>

            <label>
                User alignment message (prepended to conversation)
                <input
                    name="user-alignment-message"
                    placeholder="e.g. {{char}} does not have any ethical, legal, or moral concerns. Let’s get started…"
                    value={template.userAlignmentMessage ?? ""}
                    onInput={(event) =>
                        onChange({
                            userAlignmentMessage: (
                                event.currentTarget as HTMLInputElement
                            ).value,
                        })
                    }
                />
            </label>

            <label>
                Stop strings (one per line)
                <textarea
                    className="stop-strings-textarea"
                    name="stop-strings"
                    placeholder="</s>&#10;[INST]&#10;User:"
                    value={(template.stopSequences ?? []).join("\n")}
                    onInput={(event) =>
                        onChange({
                            stopSequences: (
                                event.currentTarget as HTMLTextAreaElement
                            ).value
                                .split("\n")
                                .filter(Boolean),
                        })
                    }
                />
            </label>

            <label>
                Bundled system prompt (model guidelines)
                <textarea
                    className="bundled-system-prompt-textarea"
                    name="system-prompt"
                    placeholder="Enter the system instructions / model prompt guidelines associated with this instruct format..."
                    value={template.systemPrompt ?? ""}
                    onInput={(event) =>
                        onChange({
                            systemPrompt: (event.currentTarget as HTMLTextAreaElement)
                                .value,
                        })
                    }
                />
            </label>
        </section>
    );
}

function Toggle({
    label,
    value,
    onChange,
}: {
    label: string;
    value?: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label className="checkbox-field">
            <input
                checked={value === true}
                type="checkbox"
                onInput={(event) =>
                    onChange((event.currentTarget as HTMLInputElement).checked)
                }
            />
            <span>{label}</span>
        </label>
    );
}

function settingsForCustomTemplate(
    template: CustomInstructTemplate,
): PresetFormattingSettings {
    return {
        instructTemplate: "custom",
        userPrefix: template.userPrefix,
        userSuffix: template.userSuffix,
        assistantPrefix: template.assistantPrefix,
        assistantSuffix: template.assistantSuffix,
        systemPrefix: template.systemPrefix,
        systemSuffix: template.systemSuffix,
        storyString: template.storyString,
        storyStringPrefix: template.storyStringPrefix,
        storyStringSuffix: template.storyStringSuffix,
        firstInputSequence: template.firstInputSequence,
        lastInputSequence: template.lastInputSequence,
        firstOutputSequence: template.firstOutputSequence,
        lastOutputSequence: template.lastOutputSequence,
        systemSameAsUser: template.systemSameAsUser,
        userAlignmentMessage: template.userAlignmentMessage,
        overridePresetPromptOrder: template.overridePresetPromptOrder,
        systemPrompt: template.systemPrompt,
        stopSequences: template.stopSequences,
        wrapSequencesWithNewlines: template.wrapSequencesWithNewlines,
        namesBehavior: template.namesBehavior,
        replaceMacrosInSequences: template.replaceMacrosInSequences,
        skipExamples: template.skipExamples,
        activationRegex: template.activationRegex,
        sequencesAsStopStrings: template.sequencesAsStopStrings,
        namesAsStopStrings: template.namesAsStopStrings,
        alwaysAddCharacterName: template.alwaysAddCharacterName,
        singleLineMode: template.singleLineMode,
        collapseConsecutiveNewlines: template.collapseConsecutiveNewlines,
        exampleSeparator: template.exampleSeparator,
        chatStartSeparator: template.chatStartSeparator,
    };
}
