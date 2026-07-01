import styles from "./styles.css?raw";

import { BookOpen, Plus, Save, Search, Trash2 } from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import { loadLorebook, saveLorebook } from "#frontend/lib/api/client";
import { createId } from "#frontend/lib/common/ids";
import type {
    Lorebook,
    LorebookEntry,
    LorebookGenerationTrigger,
    LorebookInsertionPosition,
    LorebookSettings,
} from "#frontend/lib/lorebooks/types";
import type { PluginAppSnapshot, SmileyPluginApi } from "#frontend/lib/plugins/types";

import { lorebooksManifest } from "./manifest";

type Selection = "settings" | string;
type EntryTab = "content" | "triggers" | "placement";

const insertionPositions: LorebookInsertionPosition[] = [
    "before-char",
    "after-char",
    "before-examples",
    "after-examples",
    "author-note-top",
    "author-note-bottom",
    "at-depth",
    "outlet",
];
const triggerOptions: LorebookGenerationTrigger[] = [
    "normal",
    "swipe",
    "continue",
    "impersonate",
];

export function activate(api: SmileyPluginApi) {
    api.ui.addStyles(styles);

    return api.events.on("app:open-lorebook-manager", (payload) => {
        const snapshot = api.state.getSnapshot();

        if (snapshot) {
            openManager(api, snapshot, lorebookIdFromPayload(payload));
        }
    });
}

function openManager(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot,
    initialLorebookId?: string,
) {
    api.ui.openModal({
        id: "manager",
        title: "LoreBook Manager",
        render: ({ close, snapshot: modalSnapshot }) => (
            <LorebookManager
                api={api}
                close={close}
                initialLorebookId={initialLorebookId}
                snapshot={modalSnapshot ?? snapshot}
            />
        ),
    });
}

function LorebookManager({
    api,
    close,
    initialLorebookId,
    snapshot,
}: {
    api: SmileyPluginApi;
    close: () => void;
    initialLorebookId?: string;
    snapshot: PluginAppSnapshot;
}) {
    const summaries = snapshot.lorebooks.lorebooks;
    const [selectedLorebookId, setSelectedLorebookId] = useState(
        initialLorebookId && summaries.some((item) => item.id === initialLorebookId)
            ? initialLorebookId
            : snapshot.lorebooks.activeLorebookId || summaries[0]?.id || "",
    );
    const [activeLorebook, setActiveLorebook] = useState<Lorebook | undefined>();
    const [selection, setSelection] = useState<Selection>("settings");
    const [entryTab, setEntryTab] = useState<EntryTab>("content");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!selectedLorebookId && summaries[0]?.id) {
            setSelectedLorebookId(summaries[0].id);
        }
    }, [selectedLorebookId, summaries]);

    useEffect(() => {
        if (!selectedLorebookId) {
            setActiveLorebook(undefined);
            return;
        }

        let cancelled = false;

        setLoading(true);
        setStatus("");
        loadLorebook(selectedLorebookId)
            .then((lorebook) => {
                if (!cancelled) {
                    setActiveLorebook(lorebook);
                    setSelection("settings");
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setActiveLorebook(undefined);
                    setStatus("Could not load this LoreBook.");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [selectedLorebookId]);

    const filteredEntries = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        if (!activeLorebook || !normalizedQuery) {
            return activeLorebook?.entries ?? [];
        }

        return activeLorebook.entries.filter((entry) =>
            [entry.title, ...entry.keys, ...entry.secondaryKeys]
                .join(" ")
                .toLowerCase()
                .includes(normalizedQuery),
        );
    }, [activeLorebook, query]);
    const selectedEntry =
        selection === "settings"
            ? undefined
            : activeLorebook?.entries.find((entry) => entry.id === selection);

    function updateLorebook(patch: Partial<Lorebook>) {
        if (!activeLorebook) {
            return;
        }

        setActiveLorebook({
            ...activeLorebook,
            ...patch,
            updatedAt: new Date().toISOString(),
        });
    }

    function updateSettings(patch: Partial<LorebookSettings>) {
        if (!activeLorebook) {
            return;
        }

        updateLorebook({
            settings: {
                ...activeLorebook.settings,
                ...patch,
            },
        });
    }

    function updateEntry(entryId: string, patch: Partial<LorebookEntry>) {
        if (!activeLorebook) {
            return;
        }

        updateLorebook({
            entries: activeLorebook.entries.map((entry) =>
                entry.id === entryId ? { ...entry, ...patch } : entry,
            ),
        });
    }

    function addEntry() {
        if (!activeLorebook) {
            return;
        }

        const entry = createEntry();

        updateLorebook({ entries: [...activeLorebook.entries, entry] });
        setSelection(entry.id);
        setEntryTab("content");
    }

    function deleteEntry(entryId: string) {
        if (!activeLorebook) {
            return;
        }

        const entry = activeLorebook.entries.find((item) => item.id === entryId);

        if (!entry) {
            return;
        }

        const confirmed = window.confirm(
            `Delete "${entry.title || "Untitled entry"}" from this LoreBook? Save the LoreBook to make this permanent.`,
        );

        if (!confirmed) {
            return;
        }

        const nextEntries = activeLorebook.entries.filter((item) => item.id !== entryId);
        const deletedIndex = activeLorebook.entries.findIndex(
            (item) => item.id === entryId,
        );
        const nextSelection =
            nextEntries[Math.min(deletedIndex, nextEntries.length - 1)]?.id ?? "settings";

        updateLorebook({ entries: nextEntries });
        setSelection(nextSelection);
        setEntryTab("content");
        setStatus("Entry deleted. Save the LoreBook to keep this change.");
    }

    async function persist() {
        if (!activeLorebook) {
            return;
        }

        setSaving(true);
        setStatus("");

        try {
            const result = await saveLorebook(activeLorebook);
            setActiveLorebook(result.lorebook);
            api.events.emit("app:data-changed", { type: "lorebooks" });
            setStatus("Saved.");
        } catch {
            setStatus("Could not save LoreBook.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="lbm-manager">
            <aside className="lbm-nav">
                <label className="lbm-field">
                    <span>LoreBook</span>
                    <select
                        value={selectedLorebookId}
                        onInput={(event) =>
                            setSelectedLorebookId(
                                (event.currentTarget as HTMLSelectElement).value,
                            )
                        }
                    >
                        {summaries.map((lorebook) => (
                            <option key={lorebook.id} value={lorebook.id}>
                                {lorebook.title}
                            </option>
                        ))}
                    </select>
                </label>

                <button
                    className={`lbm-nav-item ${selection === "settings" ? "active" : ""}`}
                    type="button"
                    onClick={() => setSelection("settings")}
                >
                    <BookOpen size={15} />
                    <span>Global Settings</span>
                </button>

                <label className="lbm-search">
                    <Search size={15} />
                    <input
                        type="search"
                        placeholder="Search entries"
                        value={query}
                        onInput={(event) =>
                            setQuery((event.currentTarget as HTMLInputElement).value)
                        }
                    />
                </label>

                <div className="lbm-entry-list">
                    {loading ? (
                        <p className="lbm-muted">Loading...</p>
                    ) : filteredEntries.length ? (
                        filteredEntries.map((entry) => (
                            <article
                                className={`lbm-entry-row ${selection === entry.id ? "active" : ""}`}
                                key={entry.id}
                            >
                                <button
                                    type="button"
                                    onClick={() => setSelection(entry.id)}
                                >
                                    <strong>{entry.title || "Untitled entry"}</strong>
                                    <small>
                                        {entry.keys.join(", ") || "No primary keys"}
                                    </small>
                                </button>
                                <label title={entry.enabled ? "Disable" : "Enable"}>
                                    <input
                                        type="checkbox"
                                        checked={entry.enabled}
                                        onChange={(event) =>
                                            updateEntry(entry.id, {
                                                enabled: (
                                                    event.currentTarget as HTMLInputElement
                                                ).checked,
                                            })
                                        }
                                    />
                                </label>
                            </article>
                        ))
                    ) : (
                        <p className="lbm-muted">No matching entries.</p>
                    )}
                </div>

                <button
                    className="lbm-add-button"
                    type="button"
                    disabled={!activeLorebook}
                    onClick={addEntry}
                >
                    <Plus size={15} />
                    <span>Add Entry</span>
                </button>
            </aside>

            <main className="lbm-editor">
                <div className="lbm-editor-toolbar">
                    <div className="lbm-editor-status">
                        <strong>{activeLorebook?.title ?? "No LoreBook selected"}</strong>
                        <p>
                            {status ||
                                activeLorebook?.description ||
                                "Native LoreBook editor."}
                        </p>
                    </div>
                    <div className="lbm-editor-toolbar-actions">
                        <button
                            className="lbm-back-button"
                            type="button"
                            onClick={() => {
                                close();
                                window.setTimeout(() => {
                                    api.events.emit("app:open-settings", "lorebooks");
                                }, 0);
                            }}
                        >
                            Back to Settings
                        </button>
                        <button
                            className="primary"
                            type="button"
                            disabled={!activeLorebook || saving}
                            onClick={() => void persist()}
                        >
                            <Save size={15} />
                            <span>{saving ? "Saving" : "Save"}</span>
                        </button>
                    </div>
                </div>

                {!activeLorebook ? (
                    <div className="lbm-empty-editor">
                        {summaries.length
                            ? "Select a LoreBook to edit."
                            : "No LoreBooks are available yet."}
                    </div>
                ) : selection === "settings" ? (
                    <GlobalSettingsForm
                        settings={activeLorebook.settings}
                        onChange={updateSettings}
                    />
                ) : selectedEntry ? (
                    <EntryEditor
                        entry={selectedEntry}
                        tab={entryTab}
                        onTabChange={setEntryTab}
                        onChange={(patch) => updateEntry(selectedEntry.id, patch)}
                        onDelete={() => deleteEntry(selectedEntry.id)}
                    />
                ) : (
                    <div className="lbm-empty-editor">Select an entry to edit.</div>
                )}
            </main>
        </div>
    );
}

function lorebookIdFromPayload(payload: unknown) {
    const lorebookId =
        payload && typeof payload === "object"
            ? (payload as { lorebookId?: unknown }).lorebookId
            : undefined;

    return typeof lorebookId === "string" && lorebookId.trim() ? lorebookId : undefined;
}

function GlobalSettingsForm({
    settings,
    onChange,
}: {
    settings: LorebookSettings;
    onChange: (patch: Partial<LorebookSettings>) => void;
}) {
    return (
        <div className="lbm-form">
            <section>
                <h4>Scanning Limits</h4>
                <NumberField
                    label="Scan Depth"
                    value={settings.scanDepth}
                    min={1}
                    onChange={(scanDepth) => onChange({ scanDepth })}
                />
                <CheckboxField
                    label="Recursive"
                    checked={settings.recursive}
                    onChange={(recursive) => onChange({ recursive })}
                />
                <NumberField
                    label="Max Recursion Steps"
                    value={settings.maxRecursionSteps}
                    min={1}
                    onChange={(maxRecursionSteps) => onChange({ maxRecursionSteps })}
                />
            </section>

            <section>
                <h4>Budgeting</h4>
                <label className="lbm-field">
                    <span>Context Budget Mode</span>
                    <select
                        value={settings.tokenBudget.mode}
                        onInput={(event) =>
                            onChange({
                                tokenBudget: {
                                    ...settings.tokenBudget,
                                    mode: (event.currentTarget as HTMLSelectElement)
                                        .value as LorebookSettings["tokenBudget"]["mode"],
                                },
                            })
                        }
                    >
                        <option value="tokens">Tokens</option>
                        <option value="percent">Percent</option>
                    </select>
                </label>
                <NumberField
                    label="Budget Value"
                    value={settings.tokenBudget.value}
                    min={1}
                    onChange={(value) =>
                        onChange({ tokenBudget: { ...settings.tokenBudget, value } })
                    }
                />
                <CheckboxField
                    label="Overflow Alert"
                    checked={settings.overflowAlert}
                    onChange={(overflowAlert) => onChange({ overflowAlert })}
                />
            </section>

            <section>
                <h4>Matching Rules</h4>
                <CheckboxField
                    label="Case Sensitive"
                    checked={settings.caseSensitive}
                    onChange={(caseSensitive) => onChange({ caseSensitive })}
                />
                <CheckboxField
                    label="Match Whole Words"
                    checked={settings.matchWholeWords}
                    onChange={(matchWholeWords) => onChange({ matchWholeWords })}
                />
                <CheckboxField
                    label="Include Character Names"
                    checked={settings.includeNames}
                    onChange={(includeNames) => onChange({ includeNames })}
                />
            </section>

            <section>
                <h4>Insertion Strategy</h4>
                <label className="lbm-field">
                    <span>Strategy</span>
                    <select
                        value={settings.insertionStrategy}
                        onInput={(event) =>
                            onChange({
                                insertionStrategy: (
                                    event.currentTarget as HTMLSelectElement
                                ).value as LorebookSettings["insertionStrategy"],
                            })
                        }
                    >
                        <option value="sorted-evenly">Sorted evenly</option>
                        <option value="character-first">Character first</option>
                        <option value="global-first">Global first</option>
                    </select>
                </label>
            </section>
        </div>
    );
}

function EntryEditor({
    entry,
    tab,
    onTabChange,
    onChange,
    onDelete,
}: {
    entry: LorebookEntry;
    tab: EntryTab;
    onTabChange: (tab: EntryTab) => void;
    onChange: (patch: Partial<LorebookEntry>) => void;
    onDelete: () => void;
}) {
    return (
        <div className="lbm-entry-editor">
            <div className="lbm-entry-editor-header">
                <nav className="lbm-tabs" aria-label="Entry editor sections">
                    <button
                        className={tab === "content" ? "active" : ""}
                        type="button"
                        onClick={() => onTabChange("content")}
                    >
                        Content
                    </button>
                    <button
                        className={tab === "triggers" ? "active" : ""}
                        type="button"
                        onClick={() => onTabChange("triggers")}
                    >
                        Triggers & Logic
                    </button>
                    <button
                        className={tab === "placement" ? "active" : ""}
                        type="button"
                        onClick={() => onTabChange("placement")}
                    >
                        Placement & Budget
                    </button>
                </nav>
                <button className="danger-button" type="button" onClick={onDelete}>
                    <Trash2 size={15} />
                    <span>Delete Entry</span>
                </button>
            </div>

            {tab === "content" && (
                <div className="lbm-form">
                    <section>
                        <TextField
                            label="Title"
                            value={entry.title}
                            onChange={(title) => onChange({ title })}
                        />
                        <CheckboxField
                            label="Enabled"
                            checked={entry.enabled}
                            onChange={(enabled) => onChange({ enabled })}
                        />
                        <label className="lbm-field stretch">
                            <span>Content</span>
                            <textarea
                                value={entry.content}
                                onInput={(event) =>
                                    onChange({
                                        content: (
                                            event.currentTarget as HTMLTextAreaElement
                                        ).value,
                                    })
                                }
                            />
                        </label>
                    </section>
                </div>
            )}

            {tab === "triggers" && (
                <div className="lbm-form">
                    <section>
                        <TextField
                            label="Primary Keys"
                            value={entry.keys.join(", ")}
                            onChange={(value) => onChange({ keys: splitList(value) })}
                        />
                        <TextField
                            label="Secondary Keys"
                            value={entry.secondaryKeys.join(", ")}
                            onChange={(value) =>
                                onChange({ secondaryKeys: splitList(value) })
                            }
                        />
                        <label className="lbm-field">
                            <span>Selective Logic</span>
                            <select
                                value={entry.selectiveLogic}
                                onInput={(event) =>
                                    onChange({
                                        selectiveLogic: (
                                            event.currentTarget as HTMLSelectElement
                                        ).value as LorebookEntry["selectiveLogic"],
                                    })
                                }
                            >
                                <option value="and-all">AND ALL</option>
                                <option value="and-any">AND ANY</option>
                                <option value="not-all">NOT ALL</option>
                                <option value="not-any">NOT ANY</option>
                            </select>
                        </label>
                        <label className="lbm-field">
                            <span>Strategy</span>
                            <select
                                value={entry.strategy}
                                onInput={(event) =>
                                    onChange({
                                        strategy: (
                                            event.currentTarget as HTMLSelectElement
                                        ).value as LorebookEntry["strategy"],
                                    })
                                }
                            >
                                <option value="constant">Constant</option>
                                <option value="keyword">Keyword</option>
                            </select>
                        </label>
                    </section>

                    <section>
                        <h4>Trigger Events</h4>
                        <div className="lbm-checkbox-grid">
                            {triggerOptions.map((trigger) => (
                                <CheckboxField
                                    key={trigger}
                                    label={labelFromValue(trigger)}
                                    checked={entry.triggers.includes(trigger)}
                                    onChange={(checked) =>
                                        onChange({
                                            triggers: checked
                                                ? [...entry.triggers, trigger]
                                                : entry.triggers.filter(
                                                      (item) => item !== trigger,
                                                  ),
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </section>

                    <section>
                        <h4>Probability</h4>
                        <CheckboxField
                            label="Use Probability"
                            checked={entry.useProbability}
                            onChange={(useProbability) => onChange({ useProbability })}
                        />
                        <div className="lbm-range-row">
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={entry.probability}
                                disabled={!entry.useProbability}
                                onInput={(event) =>
                                    onChange({
                                        probability: numericValue(
                                            event.currentTarget as HTMLInputElement,
                                            0,
                                            100,
                                        ),
                                    })
                                }
                            />
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={entry.probability}
                                disabled={!entry.useProbability}
                                onInput={(event) =>
                                    onChange({
                                        probability: numericValue(
                                            event.currentTarget as HTMLInputElement,
                                            0,
                                            100,
                                        ),
                                    })
                                }
                            />
                        </div>
                    </section>
                </div>
            )}

            {tab === "placement" && (
                <div className="lbm-form">
                    <section>
                        <label className="lbm-field">
                            <span>Position</span>
                            <select
                                value={entry.position}
                                onInput={(event) =>
                                    onChange({
                                        position: (
                                            event.currentTarget as HTMLSelectElement
                                        ).value as LorebookInsertionPosition,
                                    })
                                }
                            >
                                {insertionPositions.map((position) => (
                                    <option key={position} value={position}>
                                        {labelFromValue(position)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {entry.position === "at-depth" && (
                            <NumberField
                                label="Depth"
                                value={entry.depth}
                                min={0}
                                onChange={(depth) => onChange({ depth })}
                            />
                        )}
                        {entry.position === "outlet" && (
                            <TextField
                                label="Outlet Name"
                                value={entry.outletName}
                                onChange={(outletName) => onChange({ outletName })}
                            />
                        )}
                        <label className="lbm-field">
                            <span>Role</span>
                            <select
                                value={entry.role}
                                onInput={(event) =>
                                    onChange({
                                        role: (event.currentTarget as HTMLSelectElement)
                                            .value as LorebookEntry["role"],
                                    })
                                }
                            >
                                <option value="system">System</option>
                                <option value="user">User</option>
                                <option value="assistant">Assistant</option>
                            </select>
                        </label>
                        <NumberField
                            label="Insertion Order"
                            value={entry.insertionOrder}
                            min={-10000}
                            onChange={(insertionOrder) => onChange({ insertionOrder })}
                        />
                        <CheckboxField
                            label="Ignore Context Budget"
                            checked={entry.ignoreBudget}
                            onChange={(ignoreBudget) => onChange({ ignoreBudget })}
                        />
                    </section>
                </div>
            )}
        </div>
    );
}

function TextField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="lbm-field">
            <span>{label}</span>
            <input
                type="text"
                value={value}
                onInput={(event) =>
                    onChange((event.currentTarget as HTMLInputElement).value)
                }
            />
        </label>
    );
}

function NumberField({
    label,
    value,
    min,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="lbm-field">
            <span>{label}</span>
            <input
                type="number"
                min={min}
                value={value}
                onInput={(event) =>
                    onChange(numericValue(event.currentTarget as HTMLInputElement, min))
                }
            />
        </label>
    );
}

function CheckboxField({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="lbm-check">
            <span>{label}</span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                    onChange((event.currentTarget as HTMLInputElement).checked)
                }
            />
        </label>
    );
}

function createEntry(): LorebookEntry {
    return {
        id: createId("lore-entry"),
        enabled: true,
        title: "New entry",
        keys: ["new entry"],
        secondaryKeys: [],
        selectiveLogic: "and-any",
        content: "",
        strategy: "keyword",
        insertionOrder: 100,
        position: "after-char",
        role: "system",
        depth: 4,
        outletName: "",
        probability: 100,
        useProbability: false,
        inclusionGroups: [],
        groupWeight: 100,
        prioritizeInclusion: false,
        recursive: {
            exclude: false,
            preventFurther: false,
            delayUntilRecursion: 0,
        },
        matchSources: {
            personaDescription: false,
            characterDescription: false,
            characterPersonality: false,
            characterNotes: false,
            scenario: false,
            creatorNotes: false,
        },
        timedEffects: {
            sticky: 0,
            cooldown: 0,
            delay: 0,
        },
        characterFilter: {
            mode: "include",
            names: [],
            tags: [],
        },
        triggers: [],
        automationId: "",
        ignoreBudget: false,
        extensions: {},
    };
}

function splitList(value: string) {
    return Array.from(
        new Set(
            value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );
}

function numericValue(
    input: HTMLInputElement,
    min: number,
    max = Number.MAX_SAFE_INTEGER,
) {
    const value = Number(input.value);

    if (!Number.isFinite(value)) {
        return min;
    }

    return Math.min(max, Math.max(min, Math.round(value)));
}

function labelFromValue(value: string) {
    return value
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export const lorebooksPlugin = {
    manifest: lorebooksManifest,
    module: { activate },
};
