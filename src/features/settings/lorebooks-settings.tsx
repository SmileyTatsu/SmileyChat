import { BookOpen, Download, FileJson, Info, Trash2, Upload } from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import {
    deleteLorebook,
    exportLorebook,
    importLorebookFiles,
    loadLorebook,
    saveLorebook,
} from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import type { Lorebook, LorebookCollection } from "#frontend/lib/lorebooks/types";
import type { LorebookEntry } from "#frontend/lib/lorebooks/types";

type LorebooksSettingsProps = {
    collection: LorebookCollection;
    loadError?: string;
    onCollectionChange: (collection: LorebookCollection) => void;
};

export function LorebooksSettings({
    collection,
    loadError,
    onCollectionChange,
}: LorebooksSettingsProps) {
    const [activeLorebook, setActiveLorebook] = useState<Lorebook | undefined>();
    const [detailLoadError, setDetailLoadError] = useState("");
    const [status, setStatus] = useState("");
    const [isBusy, setIsBusy] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const selectedId =
        activeLorebook?.id ||
        collection.activeLorebookId ||
        collection.lorebooks[0]?.id ||
        "";
    const selectedSummary = useMemo(
        () => collection.lorebooks.find((item) => item.id === selectedId),
        [collection, selectedId],
    );
    const activeSummaries = useMemo(
        () => collection.lorebooks.filter((lorebook) => lorebook.enabled !== false),
        [collection],
    );
    const inactiveSummaries = useMemo(
        () => collection.lorebooks.filter((lorebook) => lorebook.enabled === false),
        [collection],
    );
    const activeLorebookEnabled = activeLorebook
        ? activeLorebook.metadata?.enabled !== false
        : selectedSummary?.enabled !== false;

    useEffect(() => {
        if (!selectedId) {
            setActiveLorebook(undefined);
            return;
        }

        void selectLorebook(selectedId);
    }, [selectedId]);

    async function selectLorebook(lorebookId: string) {
        try {
            setDetailLoadError("");
            setActiveLorebook(await loadLorebook(lorebookId));
        } catch (error) {
            setDetailLoadError(messageFromError(error, "Failed to load LoreBook."));
        }
    }

    function applyCollection(nextCollection: LorebookCollection) {
        onCollectionChange(nextCollection);
    }

    async function handleImport(files: FileList | null) {
        if (!files?.length) {
            return;
        }

        const formData = new FormData();

        for (const file of Array.from(files)) {
            formData.append("files", file);
        }

        try {
            setIsBusy(true);
            setStatus("");
            const result = await importLorebookFiles(formData);

            if (result.lorebooks) {
                applyCollection(result.lorebooks);
            }
            setStatus(
                `Imported ${result.imported} LoreBook${result.imported === 1 ? "" : "s"}.`,
            );
            if (result.activeLorebookId) {
                await selectLorebook(result.activeLorebookId);
            }
            if (result.failed.length > 0) {
                setStatus(
                    `Imported ${result.imported}; ${result.failed.length} file${result.failed.length === 1 ? "" : "s"} failed.`,
                );
            }
        } catch (error) {
            setStatus(messageFromError(error, "Import failed."));
        } finally {
            setIsBusy(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    }

    async function handleExport(format: "json" | "smiley") {
        if (!selectedId) {
            return;
        }

        try {
            setIsBusy(true);
            setStatus("");
            const response = await exportLorebook(selectedId, format);
            downloadResponse(response, fallbackExportName(format));
            setStatus("Exported LoreBook.");
            setIsExportMenuOpen(false);
        } catch (error) {
            setStatus(messageFromError(error, "Export failed."));
        } finally {
            setIsBusy(false);
        }
    }

    async function handleDelete() {
        if (!activeLorebook) {
            return;
        }

        const confirmed = window.confirm(`Delete "${activeLorebook.title}"?`);

        if (!confirmed) {
            return;
        }

        try {
            setIsBusy(true);
            const result = await deleteLorebook(activeLorebook.id);

            applyCollection(
                result.lorebooks ?? {
                    version: 1,
                    activeLorebookId: "",
                    lorebooks: [],
                },
            );
            setActiveLorebook(undefined);
            setStatus("Deleted LoreBook.");
        } catch (error) {
            setStatus(messageFromError(error, "Delete failed."));
        } finally {
            setIsBusy(false);
        }
    }

    async function toggleEntry(entryId: string, enabled: boolean) {
        if (!activeLorebook) {
            return;
        }

        const updatedLorebook: Lorebook = {
            ...activeLorebook,
            entries: activeLorebook.entries.map((entry) =>
                entry.id === entryId ? { ...entry, enabled } : entry,
            ),
            updatedAt: new Date().toISOString(),
        };

        setActiveLorebook(updatedLorebook);
        try {
            setIsBusy(true);
            const result = await saveLorebook(updatedLorebook);
            setActiveLorebook(result.lorebook);
            if (result.lorebooks) {
                applyCollection(result.lorebooks);
            }
            setStatus(enabled ? "Enabled entry." : "Disabled entry.");
        } catch (error) {
            setActiveLorebook(activeLorebook);
            setStatus(messageFromError(error, "Failed to update entry."));
        } finally {
            setIsBusy(false);
        }
    }

    async function toggleLorebook(lorebookId: string, enabled: boolean) {
        const previousLorebook = activeLorebook;

        try {
            setIsBusy(true);
            const sourceLorebook =
                activeLorebook?.id === lorebookId
                    ? activeLorebook
                    : await loadLorebook(lorebookId);
            const updatedLorebook: Lorebook = {
                ...sourceLorebook,
                metadata: {
                    ...(sourceLorebook.metadata ?? {}),
                    enabled,
                },
                updatedAt: new Date().toISOString(),
            };

            if (activeLorebook?.id === lorebookId) {
                setActiveLorebook(updatedLorebook);
            }

            const result = await saveLorebook(updatedLorebook);

            if (activeLorebook?.id === lorebookId) {
                setActiveLorebook(result.lorebook);
            }
            if (result.lorebooks) {
                applyCollection(result.lorebooks);
            }
            setStatus(enabled ? "Enabled LoreBook." : "Disabled LoreBook.");
        } catch (error) {
            setActiveLorebook(previousLorebook);
            setStatus(messageFromError(error, "Failed to update LoreBook."));
        } finally {
            setIsBusy(false);
        }
    }

    function fallbackExportName(format: "json" | "smiley") {
        const base = activeLorebook?.title || selectedSummary?.title || "lorebook";
        return `${base}.${format === "smiley" ? "smiley-lorebook" : "worldinfo"}.json`;
    }

    function renderLorebookSection(
        title: string,
        lorebooks: LorebookCollection["lorebooks"],
    ) {
        return (
            <section className="lorebook-list-section">
                <h3>
                    {title}
                    <span>{lorebooks.length}</span>
                </h3>
                {lorebooks.length === 0 ? (
                    <p>
                        {title === "Active"
                            ? "No active LoreBooks."
                            : "No inactive LoreBooks."}
                    </p>
                ) : (
                    lorebooks.map((lorebook) => (
                        <div
                            className={lorebook.id === selectedId ? "active" : ""}
                            key={lorebook.id}
                        >
                            <button
                                type="button"
                                onClick={() => void selectLorebook(lorebook.id)}
                            >
                                <strong>{lorebook.title}</strong>
                                <small>
                                    {lorebook.entryCount} entries,{" "}
                                    {lorebook.enabledEntryCount} enabled
                                </small>
                            </button>
                            <label className="plugin-toggle lorebook-toggle">
                                <span>{lorebook.enabled ? "On" : "Off"}</span>
                                <input
                                    type="checkbox"
                                    checked={lorebook.enabled}
                                    disabled={isBusy}
                                    onChange={(event) =>
                                        void toggleLorebook(
                                            lorebook.id,
                                            event.currentTarget.checked,
                                        )
                                    }
                                />
                                <span className="plugin-toggle-track">
                                    <span />
                                </span>
                            </label>
                        </div>
                    ))
                )}
            </section>
        );
    }

    return (
        <section className="tool-window lorebooks-settings">
            <header className="settings-section-heading">
                <div>
                    <h2>LoreBooks</h2>
                    <p>
                        Native storage, import, and export are ready. Detailed editing
                        will be handled by the LoreBooks extension.
                    </p>
                </div>
                <div className="button-row">
                    <input
                        ref={fileInputRef}
                        hidden
                        type="file"
                        accept="application/json,.json"
                        multiple
                        onChange={(event) => void handleImport(event.currentTarget.files)}
                    />
                    <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload size={16} />
                        Import
                    </button>
                </div>
            </header>

            {loadError && <p className="connection-status error">{loadError}</p>}
            {detailLoadError && (
                <p className="connection-status error">{detailLoadError}</p>
            )}
            {status && <p className="connection-status">{status}</p>}

            <div className="lorebook-editor">
                <aside className="lorebook-list">
                    {collection.lorebooks.length === 0 ? (
                        <div className="empty-lorebook-state">
                            <BookOpen size={18} />
                            <p>No LoreBooks imported.</p>
                        </div>
                    ) : (
                        <>
                            {renderLorebookSection("Active", activeSummaries)}
                            {renderLorebookSection("Inactive", inactiveSummaries)}
                        </>
                    )}
                </aside>

                <section className="lorebook-detail-panel">
                    <div className="settings-card lorebook-extension-notice">
                        <header>
                            <Info size={18} />
                            <div>
                                <h3>Manage this with our extension</h3>
                                <p>
                                    Import and export work here. Full LoreBook editing,
                                    bindings, activation previews, and prompt controls
                                    will live in the bundled LoreBooks extension.
                                </p>
                            </div>
                        </header>
                    </div>

                    {activeLorebook ? (
                        <>
                            <div className="settings-card">
                                <header>
                                    <FileJson size={18} />
                                    <div>
                                        <h3>{activeLorebook.title}</h3>
                                        <p>
                                            {activeLorebook.description ||
                                                "No description saved."}
                                        </p>
                                    </div>
                                </header>
                                <dl className="plugin-meta-grid">
                                    <div>
                                        <dt>Entries</dt>
                                        <dd>{activeLorebook.entries.length}</dd>
                                    </div>
                                    <div>
                                        <dt>Enabled</dt>
                                        <dd>
                                            {
                                                activeLorebook.entries.filter(
                                                    (entry) => entry.enabled,
                                                ).length
                                            }
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>Scan depth</dt>
                                        <dd>{activeLorebook.settings.scanDepth}</dd>
                                    </div>
                                    <div>
                                        <dt>Recursive</dt>
                                        <dd>
                                            {activeLorebook.settings.recursive
                                                ? "Yes"
                                                : "No"}
                                        </dd>
                                    </div>
                                </dl>
                                <div className="button-row">
                                    <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                            void toggleLorebook(
                                                activeLorebook.id,
                                                !activeLorebookEnabled,
                                            )
                                        }
                                    >
                                        {activeLorebookEnabled ? "Disable" : "Enable"}
                                    </button>
                                    <div className="export-menu-wrap">
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            aria-expanded={isExportMenuOpen}
                                            onClick={() =>
                                                setIsExportMenuOpen((open) => !open)
                                            }
                                        >
                                            <Download size={16} />
                                            Export
                                        </button>
                                        {isExportMenuOpen && (
                                            <div
                                                className="export-menu"
                                                role="menu"
                                                aria-label="Export LoreBook"
                                            >
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() =>
                                                        void handleExport("smiley")
                                                    }
                                                >
                                                    Smiley JSON
                                                </button>
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() =>
                                                        void handleExport("json")
                                                    }
                                                >
                                                    ST JSON
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className="danger-button"
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => void handleDelete()}
                                    >
                                        <Trash2 size={16} />
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <div className="lorebook-entry-preview">
                                <div className="preset-section-header">
                                    <h3>Entry Preview</h3>
                                </div>
                                {activeLorebook.entries.slice(0, 8).map((entry) => (
                                    <article key={entry.id}>
                                        <header>
                                            <div>
                                                <strong>{entry.title}</strong>
                                                <small>
                                                    {entry.keys.join(", ") || "constant"}
                                                </small>
                                            </div>
                                            <label className="plugin-toggle entry-toggle">
                                                <span>
                                                    {entry.enabled
                                                        ? "Enabled"
                                                        : "Disabled"}
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    checked={entry.enabled}
                                                    disabled={isBusy}
                                                    onChange={(event) =>
                                                        void toggleEntry(
                                                            entry.id,
                                                            event.currentTarget.checked,
                                                        )
                                                    }
                                                />
                                                <span className="plugin-toggle-track">
                                                    <span />
                                                </span>
                                            </label>
                                        </header>
                                        <dl className="lorebook-entry-meta">
                                            {entryDisplayMeta(entry).map((item) => (
                                                <div key={item.label}>
                                                    <dt>{item.label}</dt>
                                                    <dd>{item.value}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                        <p>{entry.content || "No content."}</p>
                                    </article>
                                ))}
                                {activeLorebook.entries.length > 8 && (
                                    <p className="field-hint">
                                        Showing 8 of {activeLorebook.entries.length}{" "}
                                        entries. Manage this LoreBook with the extension
                                        for full editing.
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="settings-card lorebook-empty-detail">
                            <p>
                                Select or import a LoreBook to inspect its native details.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </section>
    );
}

async function downloadResponse(response: Response, fallbackName: string) {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileNameFromDisposition(response) || fallbackName;
    link.click();
    URL.revokeObjectURL(url);
}

function fileNameFromDisposition(response: Response) {
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);

    return match?.[1] ?? "";
}

function entryDisplayMeta(entry: LorebookEntry) {
    return [
        { label: "Insertion", value: insertionLabel(entry) },
        { label: "Role", value: entry.role },
        { label: "Strategy", value: entry.strategy },
        { label: "Order", value: String(entry.insertionOrder) },
        ...(entry.position === "at-depth"
            ? [{ label: "Depth", value: String(entry.depth) }]
            : []),
        ...(entry.position === "outlet"
            ? [{ label: "Outlet", value: entry.outletName || "Unnamed" }]
            : []),
        ...(entry.secondaryKeys.length
            ? [
                  {
                      label: "Secondary",
                      value: `${entry.selectiveLogic} - ${entry.secondaryKeys.join(", ")}`,
                  },
              ]
            : []),
        ...(entry.useProbability
            ? [{ label: "Chance", value: `${entry.probability}%` }]
            : []),
        ...(entry.ignoreBudget ? [{ label: "Budget", value: "Ignored" }] : []),
    ];
}

function insertionLabel(entry: LorebookEntry) {
    if (entry.position === "outlet") {
        return "Macro outlet";
    }

    if (entry.position === "at-depth") {
        return "Depth injection";
    }

    return "Prompt injection";
}
