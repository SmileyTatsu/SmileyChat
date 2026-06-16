import { FileText, Terminal } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import type { ChatAuthorNote } from "#frontend/types";

type ChatDetailsPanelProps = {
    authorNote?: ChatAuthorNote;
    onShowDebugPayload: () => void;
    onUpdateAuthorNote: (authorNote: ChatAuthorNote) => void;
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

export function ChatDetailsPanel({
    authorNote,
    onShowDebugPayload,
    onUpdateAuthorNote,
}: ChatDetailsPanelProps) {
    const saveTimerRef = useRef<number | undefined>();
    const lastSavedKeyRef = useRef(authorNoteKey(authorNoteFromProp(authorNote)));

    const [content, setContent] = useState(() => authorNote?.content ?? "");
    const [depthInput, setDepthInput] = useState(() => String(authorNote?.depth ?? 0));
    const [role, setRole] = useState<ChatAuthorNote["role"]>(
        () => authorNote?.role ?? "system",
    );
    const [isEnabled, setIsEnabled] = useState(() => authorNote?.isEnabled ?? true);

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
            onUpdateAuthorNote(nextAuthorNote);
        }, 500);

        return clearPendingSave;
    }, [content, depthInput, role, isEnabled, onUpdateAuthorNote]);

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
        onUpdateAuthorNote(nextAuthorNote);
    }

    function handleDepthBlur() {
        const normalizedDepthInput = String(parseAuthorNoteDepthInput(depthInput));

        setDepthInput(normalizedDepthInput);
        flushSave({ depthInput: normalizedDepthInput });
    }

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
