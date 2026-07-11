import { BookOpen, FileText, Search, Terminal, X } from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { LorebookCollection } from "#frontend/lib/lorebooks/types";
import type { ChatAuthorNote, ChatMetadata } from "#frontend/types";
import { getPluginChatDetailsSections } from "#frontend/lib/plugins/registry";
import { createPluginStorage } from "#frontend/lib/plugins/runtime";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";

import {
    PluginRenderSurface,
    pluginIdFromScopedId,
} from "../plugins/plugin-error-boundary";

type ChatDetailsPanelProps = {
    chatMetadata?: ChatMetadata;
    lorebookCollection: LorebookCollection;
    pluginSnapshot: PluginAppSnapshot | undefined;
    onShowDebugPayload: () => void;
    onUpdateChatMetadata: (metadata: ChatMetadata) => void;
};

function normalizeAuthorNoteDepth(depth: unknown) {
    const parsed = typeof depth === "number" ? depth : Number(depth);

    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseAuthorNoteDepthInput(value: string) {
    return value.trim() ? normalizeAuthorNoteDepth(Number(value)) : 0;
}

function authorNoteFromProp(authorNote: ChatAuthorNote | undefined): ChatAuthorNote {
    return {
        content: authorNote?.content ?? "",
        depth: normalizeAuthorNoteDepth(authorNote?.depth),
        role: authorNote?.role ?? "system",
        isEnabled: authorNote?.isEnabled ?? true,
    };
}

function authorNoteKey(authorNote: ChatAuthorNote) {
    return JSON.stringify({
        content: authorNote.content,
        depth: normalizeAuthorNoteDepth(authorNote.depth),
        role: authorNote.role ?? "system",
        isEnabled: authorNote.isEnabled ?? true,
    });
}

export function isAuthorNoteActive(authorNote: ChatAuthorNote | undefined) {
    return authorNote?.isEnabled !== false && Boolean(authorNote?.content?.trim());
}

export function hasChatLorebooks(chatMetadata: ChatMetadata | undefined) {
    return Boolean(chatMetadata?.lorebookIds?.length);
}

export function ChatDetailsPanel({
    chatMetadata,
    lorebookCollection,
    pluginSnapshot,
    onShowDebugPayload,
    onUpdateChatMetadata,
}: ChatDetailsPanelProps) {
    const authorNote = chatMetadata?.authorNote;
    const selectedLorebookIds = chatMetadata?.lorebookIds ?? [];
    const saveTimerRef = useRef<number | undefined>();
    const lastSavedKeyRef = useRef(authorNoteKey(authorNoteFromProp(authorNote)));

    const [content, setContent] = useState(() => authorNote?.content ?? "");
    const [depthInput, setDepthInput] = useState(() => String(authorNote?.depth ?? 0));
    const [role, setRole] = useState<ChatAuthorNote["role"]>(
        () => authorNote?.role ?? "system",
    );
    const [isEnabled, setIsEnabled] = useState(() => authorNote?.isEnabled ?? true);
    const [lorebookQuery, setLorebookQuery] = useState("");
    const [isLorebookPickerOpen, setIsLorebookPickerOpen] = useState(false);
    const selectedLorebooks = useMemo(
        () =>
            selectedLorebookIds
                .map((lorebookId) =>
                    lorebookCollection.lorebooks.find(
                        (lorebook) => lorebook.id === lorebookId,
                    ),
                )
                .filter((lorebook): lorebook is LorebookCollection["lorebooks"][number] =>
                    Boolean(lorebook),
                ),
        [lorebookCollection.lorebooks, selectedLorebookIds],
    );
    const availableLorebooks = useMemo(() => {
        const selectedIds = new Set(selectedLorebookIds);
        const query = lorebookQuery.trim().toLowerCase();

        return lorebookCollection.lorebooks.filter((lorebook) => {
            if (selectedIds.has(lorebook.id)) {
                return false;
            }

            if (!query) {
                return true;
            }

            return [lorebook.title, lorebook.description]
                .join(" ")
                .toLowerCase()
                .includes(query);
        });
    }, [lorebookCollection.lorebooks, lorebookQuery, selectedLorebookIds]);

    useEffect(() => {
        const nextAuthorNote = authorNoteFromProp(authorNote);

        lastSavedKeyRef.current = authorNoteKey(nextAuthorNote);
        setContent(nextAuthorNote.content);
        setDepthInput(String(nextAuthorNote.depth ?? 0));
        setRole(nextAuthorNote.role ?? "system");
        setIsEnabled(nextAuthorNote.isEnabled ?? true);
    }, [authorNote?.content, authorNote?.depth, authorNote?.isEnabled, authorNote?.role]);

    useEffect(() => {
        const nextAuthorNote = currentAuthorNote();
        const nextKey = authorNoteKey(nextAuthorNote);

        if (nextKey === lastSavedKeyRef.current) {
            return;
        }

        clearPendingSave();
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = undefined;
            lastSavedKeyRef.current = nextKey;
            onUpdateChatMetadata({ authorNote: nextAuthorNote });
        }, 500);

        return clearPendingSave;
    }, [content, depthInput, role, isEnabled, onUpdateChatMetadata]);

    useEffect(function () {
        return clearPendingSave;
    }, []);

    function clearPendingSave() {
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = undefined;
        }
    }

    function currentAuthorNote(
        overrides: Partial<{
            content: string;
            depthInput: string;
            role: ChatAuthorNote["role"];
            isEnabled: boolean;
        }> = {},
    ): ChatAuthorNote {
        return {
            content: overrides.content ?? content,
            depth: parseAuthorNoteDepthInput(overrides.depthInput ?? depthInput),
            role: overrides.role ?? role ?? "system",
            isEnabled: overrides.isEnabled ?? isEnabled,
        };
    }

    function flushSave(
        overrides: Partial<{
            content: string;
            depthInput: string;
            role: ChatAuthorNote["role"];
            isEnabled: boolean;
        }> = {},
    ) {
        const nextAuthorNote = currentAuthorNote(overrides);
        const nextKey = authorNoteKey(nextAuthorNote);

        clearPendingSave();

        if (nextKey === lastSavedKeyRef.current) {
            return;
        }

        lastSavedKeyRef.current = nextKey;
        onUpdateChatMetadata({ authorNote: nextAuthorNote });
    }

    function handleDepthBlur() {
        const normalizedDepthInput = String(parseAuthorNoteDepthInput(depthInput));

        setDepthInput(normalizedDepthInput);
        flushSave({ depthInput: normalizedDepthInput });
    }

    function addLorebook(lorebookId: string) {
        if (selectedLorebookIds.includes(lorebookId)) {
            return;
        }

        onUpdateChatMetadata({
            lorebookIds: Array.from(new Set([...selectedLorebookIds, lorebookId])),
        });
    }

    function removeLorebook(lorebookId: string) {
        onUpdateChatMetadata({
            lorebookIds: selectedLorebookIds.filter((id) => id !== lorebookId),
        });
    }

    const chatDetailsSections = getPluginChatDetailsSections();

    return (
        <div className="chat-details-panel">
            <section className="author-note-card" aria-labelledby="author-note-title">
                <div className="author-note-card-header">
                    <div>
                        <h3 id="author-note-title">
                            <FileText size={16} />
                            Author Note
                        </h3>
                        <p>
                            Chat-scoped context injected into the prompt at the selected
                            depth.
                        </p>
                    </div>
                    <label className="author-note-switch">
                        <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(event) => {
                                const nextEnabled = event.currentTarget.checked;

                                setIsEnabled(nextEnabled);
                                flushSave({ isEnabled: nextEnabled });
                            }}
                        />
                        <span>{isEnabled ? "On" : "Off"}</span>
                    </label>
                </div>

                <textarea
                    aria-label="Author note content"
                    placeholder="Add private instructions, scene context, or continuity notes for this chat..."
                    value={content}
                    onInput={(event) => setContent(event.currentTarget.value)}
                    onBlur={() => flushSave()}
                />

                <div className="author-note-settings">
                    <label>
                        <span>Depth</span>
                        <input
                            type="number"
                            min={0}
                            value={depthInput}
                            onInput={(event) => setDepthInput(event.currentTarget.value)}
                            onBlur={handleDepthBlur}
                        />
                    </label>
                    <label>
                        <span>Role</span>
                        <select
                            value={role}
                            onChange={(event) => {
                                const nextRole = event.currentTarget
                                    .value as ChatAuthorNote["role"];

                                setRole(nextRole);
                                flushSave({ role: nextRole });
                            }}
                            onBlur={() => flushSave()}
                        >
                            <option value="system">system</option>
                            <option value="user">user</option>
                            <option value="assistant">assistant</option>
                        </select>
                    </label>
                </div>
            </section>

            <section
                className="chat-lorebooks-card"
                aria-labelledby="chat-lorebooks-title"
            >
                <div className="chat-lorebooks-card-header">
                    <div>
                        <h3 id="chat-lorebooks-title">
                            <BookOpen size={16} />
                            LoreBooks
                        </h3>
                        <p>Include LoreBooks that stay active for this chat.</p>
                    </div>
                    {selectedLorebookIds.length > 0 && (
                        <span>{selectedLorebookIds.length}</span>
                    )}
                </div>

                {lorebookCollection.lorebooks.length === 0 ? (
                    <p className="chat-lorebooks-empty">
                        Import LoreBooks in Options to attach them to this chat.
                    </p>
                ) : (
                    <>
                        <div className="chat-lorebook-selected-list">
                            {selectedLorebooks.length === 0 ? (
                                <p>No LoreBooks selected for this chat.</p>
                            ) : (
                                selectedLorebooks.map((lorebook) => (
                                    <div
                                        className="chat-lorebook-selected-row"
                                        key={lorebook.id}
                                    >
                                        <span>
                                            <strong>{lorebook.title}</strong>
                                            <small>
                                                {lorebook.entryCount} entries,{" "}
                                                {lorebook.enabledEntryCount} enabled
                                            </small>
                                        </span>
                                        <button
                                            type="button"
                                            title={`Remove ${lorebook.title}`}
                                            onClick={() => removeLorebook(lorebook.id)}
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <button
                            className="chat-lorebook-picker-trigger"
                            type="button"
                            aria-expanded={isLorebookPickerOpen}
                            onClick={() => setIsLorebookPickerOpen((open) => !open)}
                        >
                            <Search size={15} />
                            Search LoreBooks
                        </button>

                        {isLorebookPickerOpen && (
                            <div className="chat-lorebook-picker">
                                <div className="chat-lorebook-picker-header">
                                    <label className="chat-lorebook-search">
                                        <Search size={15} />
                                        <input
                                            type="search"
                                            placeholder="Type to filter"
                                            value={lorebookQuery}
                                            autoFocus
                                            onInput={(event) =>
                                                setLorebookQuery(
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        title="Close LoreBook picker"
                                        onClick={() => {
                                            setLorebookQuery("");
                                            setIsLorebookPickerOpen(false);
                                        }}
                                    >
                                        <X size={15} />
                                    </button>
                                </div>

                                <div className="chat-lorebook-list">
                                    {availableLorebooks.length === 0 ? (
                                        <p className="chat-lorebooks-empty">
                                            {lorebookQuery.trim()
                                                ? "No matching LoreBooks."
                                                : "All imported LoreBooks are selected."}
                                        </p>
                                    ) : (
                                        availableLorebooks.map((lorebook) => (
                                            <button
                                                key={lorebook.id}
                                                className="chat-lorebook-row"
                                                type="button"
                                                onClick={() => addLorebook(lorebook.id)}
                                            >
                                                <span>
                                                    <strong>{lorebook.title}</strong>
                                                    <small>
                                                        {lorebook.entryCount} entries,{" "}
                                                        {lorebook.enabledEntryCount}{" "}
                                                        enabled
                                                    </small>
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>

            {chatDetailsSections.length > 0 &&
                pluginSnapshot &&
                chatDetailsSections.map((section) => {
                    const pluginId = pluginIdFromScopedId(section.id);

                    return (
                        <section
                            className="plugin-chat-details-section author-note-card"
                            key={section.id}
                            id={section.id}
                        >
                            <PluginRenderSurface
                                pluginId={pluginId}
                                resetKey={section.id}
                                surface="Chat details"
                                render={() =>
                                    section.render({
                                        pluginId,
                                        snapshot: pluginSnapshot,
                                        storage: createPluginStorage(pluginId),
                                        updateChatMetadata: (patch) => {
                                            onUpdateChatMetadata({
                                                ...(chatMetadata ?? {}),
                                                ...patch,
                                            });
                                        },
                                    })
                                }
                            />
                        </section>
                    );
                })}

            <section className="prompt-debug-card" aria-labelledby="prompt-debug-title">
                <div className="prompt-debug-card-header">
                    <div>
                        <h3 id="prompt-debug-title">
                            <Terminal size={16} />
                            Prompt Debug
                        </h3>
                        <p>Inspect the compiled prompt and provider request body.</p>
                    </div>
                </div>
                <button
                    className="secondary-button"
                    type="button"
                    onClick={onShowDebugPayload}
                >
                    <Terminal size={15} />
                    Show payload
                </button>
            </section>
        </div>
    );
}
