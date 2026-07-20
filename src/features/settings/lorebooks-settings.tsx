import {
    BookOpen,
    ChevronDown,
    ChevronUp,
    Download,
    FileJson,
    Search,
    Trash2,
    Upload,
} from "lucide-preact";
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
import { emitPluginEvent } from "#frontend/lib/plugins/registry";

type LorebooksSettingsProps = {
    collection: LorebookCollection;
    isLorebooksPluginEnabled: boolean;
    loadError?: string;
    onClose: () => void;
    onCollectionChange: (collection: LorebookCollection) => void;
};

export function LorebooksSettings({
    collection,
    isLorebooksPluginEnabled,
    loadError,
    onClose,
    onCollectionChange,
}: LorebooksSettingsProps) {
    const [activeLorebook, setActiveLorebook] = useState<Lorebook | undefined>();
    const [detailLoadError, setDetailLoadError] = useState("");
    const [status, setStatus] = useState("");
    const [titleDraft, setTitleDraft] = useState("");
    const [isBusy, setIsBusy] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
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

    useEffect(() => {
        if (!selectedId) {
            setActiveLorebook(undefined);
            return;
        }

        void selectLorebook(selectedId);
        setSearchQuery("");
        setExpandedEntries({});
    }, [selectedId]);

    useEffect(() => {
        setTitleDraft(activeLorebook?.title ?? "");
    }, [activeLorebook?.id, activeLorebook?.title]);

    const filteredEntries = useMemo(() => {
        if (!activeLorebook?.entries) {
            return [];
        }
        const query = searchQuery.toLowerCase().trim();
        if (!query) {
            return activeLorebook.entries;
        }
        return activeLorebook.entries.filter((entry) => {
            const matchesTitle = entry.title?.toLowerCase().includes(query);
            const matchesContent = entry.content?.toLowerCase().includes(query);
            const matchesKeys = entry.keys?.some((key) =>
                key.toLowerCase().includes(query),
            );
            return matchesTitle || matchesContent || matchesKeys;
        });
    }, [activeLorebook?.entries, searchQuery]);

    const toggleEntry = (id: string) => {
        setExpandedEntries((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

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

    function fallbackExportName(format: "json" | "smiley") {
        const base = activeLorebook?.title || selectedSummary?.title || "lorebook";
        return `${base}.${format === "smiley" ? "smiley-lorebook" : "worldinfo"}.json`;
    }

    function openLorebookManager(lorebookId?: string) {
        onClose();
        window.setTimeout(() => {
            emitPluginEvent("app:open-lorebook-manager", { lorebookId });
        }, 0);
    }

    async function saveTitle() {
        if (!activeLorebook) {
            return;
        }

        const nextTitle = titleDraft.trim();

        if (!nextTitle || nextTitle === activeLorebook.title) {
            setTitleDraft(activeLorebook.title);
            return;
        }

        try {
            setIsBusy(true);
            setStatus("");

            const result = await saveLorebook({
                ...activeLorebook,
                title: nextTitle,
                updatedAt: new Date().toISOString(),
            });

            setActiveLorebook(result.lorebook);
            setTitleDraft(result.lorebook.title);

            if (result.lorebooks) {
                applyCollection(result.lorebooks);
            }

            setStatus("Renamed LoreBook.");
        } catch (error) {
            setTitleDraft(activeLorebook.title);
            setStatus(messageFromError(error, "Rename failed."));
        } finally {
            setIsBusy(false);
        }
    }

    function renderLorebookList(lorebooks: LorebookCollection["lorebooks"]) {
        return (
            <section className="lorebook-list-section">
                <h3>
                    Imported
                    <span>{lorebooks.length}</span>
                </h3>
                {lorebooks.length === 0 ? (
                    <p>No LoreBooks imported.</p>
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
                    <p>Import, inspect, rename, export, and delete native LoreBooks.</p>
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
                    <button
                        type="button"
                        disabled={!isLorebooksPluginEnabled}
                        title={
                            isLorebooksPluginEnabled
                                ? "Open LoreBook Manager"
                                : "Enable the bundled LoreBooks plugin to edit entries."
                        }
                        onClick={() => openLorebookManager(selectedId || undefined)}
                    >
                        <BookOpen size={16} />
                        Open Manager
                    </button>
                </div>
            </header>

            {!isLorebooksPluginEnabled && (
                <p className="connection-status">
                    LoreBook Manager is unavailable until the bundled LoreBooks plugin is
                    enabled.
                </p>
            )}
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
                        renderLorebookList(collection.lorebooks)
                    )}
                </aside>

                <section className="lorebook-detail-panel">
                    {activeLorebook ? (
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
                            <label className="lorebook-title-field">
                                <span>Title</span>
                                <input
                                    value={titleDraft}
                                    disabled={isBusy}
                                    onInput={(event) =>
                                        setTitleDraft(event.currentTarget.value)
                                    }
                                    onBlur={() => void saveTitle()}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.currentTarget.blur();
                                        }
                                    }}
                                />
                            </label>
                            <dl className="plugin-meta-grid">
                                <div>
                                    <dt>Entries</dt>
                                    <dd>{activeLorebook.entries.length}</dd>
                                </div>
                                <div>
                                    <dt>Scan depth</dt>
                                    <dd>{activeLorebook.settings.scanDepth}</dd>
                                </div>
                                <div>
                                    <dt>Recursive</dt>
                                    <dd>
                                        {activeLorebook.settings.recursive ? "Yes" : "No"}
                                    </dd>
                                </div>
                            </dl>

                            <div className="lorebook-entries-viewer">
                                <header className="entries-viewer-header">
                                    <h4>Entries ({activeLorebook.entries.length})</h4>
                                    <div className="entries-search-wrap">
                                        <Search size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search entries..."
                                            value={searchQuery}
                                            disabled={isBusy}
                                            onInput={(event) =>
                                                setSearchQuery(event.currentTarget.value)
                                            }
                                        />
                                    </div>
                                </header>
                                <div className="entries-viewer-list">
                                    {filteredEntries.length === 0 ? (
                                        <p className="no-entries-found">
                                            {activeLorebook.entries.length === 0
                                                ? "This LoreBook has no entries."
                                                : "No matching entries found."}
                                        </p>
                                    ) : (
                                        filteredEntries.map((entry) => {
                                            const isExpanded =
                                                !!expandedEntries[entry.id];
                                            return (
                                                <div
                                                    className={`entry-item-card ${
                                                        entry.enabled ? "" : "disabled"
                                                    }`}
                                                    key={entry.id}
                                                >
                                                    <div
                                                        className="entry-item-header"
                                                        onClick={() =>
                                                            toggleEntry(entry.id)
                                                        }
                                                    >
                                                        <div className="entry-item-title-section">
                                                            <span className="entry-item-title">
                                                                {entry.title ||
                                                                    "Untitled Entry"}
                                                            </span>
                                                            {!entry.enabled && (
                                                                <span className="entry-disabled-badge">
                                                                    Disabled
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="entry-expand-toggle"
                                                            aria-label={
                                                                isExpanded
                                                                    ? "Collapse entry content"
                                                                    : "Expand entry content"
                                                            }
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronUp size={16} />
                                                            ) : (
                                                                <ChevronDown size={16} />
                                                            )}
                                                        </button>
                                                    </div>

                                                    <div className="entry-item-meta">
                                                        <span className="entry-position-badge">
                                                            {entry.position} (depth{" "}
                                                            {entry.depth})
                                                        </span>
                                                        {entry.keys.length > 0 && (
                                                            <div className="entry-keys-pills">
                                                                {entry.keys.map((key) => (
                                                                    <span
                                                                        className="key-pill"
                                                                        key={key}
                                                                    >
                                                                        {key}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {isExpanded && (
                                                        <pre className="entry-item-content">
                                                            {entry.content}
                                                        </pre>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="button-row">
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
                                                onClick={() => void handleExport("json")}
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
