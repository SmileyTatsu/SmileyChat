import { FileText, ImagePlus, Menu, SendHorizonal, Square, X } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
    getPluginComposerActions,
    getPluginComposerOptions,
    setPluginDraftActionHandlers,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { ChatAuthorNote, ChatMode } from "#frontend/types";

type MessageComposerProps = {
    authorNote?: ChatAuthorNote;
    characterName: string;
    disabled?: boolean;
    enterToSend: boolean;
    isGenerating?: boolean;
    mode: ChatMode;
    placeholder?: string;
    resetKey: string;
    onAbortGeneration?: () => void;
    onUpdateAuthorNote?: (authorNote: ChatAuthorNote) => void;
    onSubmit: (draft: string, images?: File[]) => void | Promise<void>;
    pluginSnapshot: PluginAppSnapshot;
};

type StagedImage = {
    id: string;
    file: File;
    previewUrl: string;
};

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

function normalizeAuthorNoteDepth(depth: unknown) {
    const parsed = typeof depth === "number" ? depth : Number(depth);

    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseAuthorNoteDepthInput(value: string) {
    return value.trim() ? normalizeAuthorNoteDepth(Number(value)) : 0;
}

export function MessageComposer({
    authorNote,
    characterName,
    disabled,
    enterToSend,
    isGenerating,
    mode,
    placeholder,
    resetKey,
    onAbortGeneration,
    onUpdateAuthorNote,
    onSubmit,
    pluginSnapshot,
}: MessageComposerProps) {
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const optionsRef = useRef<HTMLDivElement>(null);
    const authorNoteSaveTimerRef = useRef<number | undefined>();
    const lastSavedAuthorNoteKeyRef = useRef(
        authorNoteKey(authorNoteFromProp(authorNote)),
    );

    const [draft, setDraft] = useState("");
    const [, setRegistryRevision] = useState(0);
    const [isAuthorNoteOpen, setIsAuthorNoteOpen] = useState(false);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
    const [authorNoteContent, setAuthorNoteContent] = useState(
        () => authorNote?.content ?? "",
    );
    const [authorNoteDepthInput, setAuthorNoteDepthInput] = useState(() =>
        String(authorNote?.depth ?? 0),
    );
    const [authorNoteRole, setAuthorNoteRole] = useState<ChatAuthorNote["role"]>(
        () => authorNote?.role ?? "system",
    );
    const [isAuthorNoteEnabled, setIsAuthorNoteEnabled] = useState(
        () => authorNote?.isEnabled ?? true,
    );

    const hasMessageContent = draft.trim().length > 0 || stagedImages.length > 0;
    const canSubmit = !disabled || isGenerating;

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    useEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;

        const maxHeight = 200;
        composer.style.height = "auto";

        const nextHeight = Math.min(composer.scrollHeight, maxHeight);
        composer.style.height = `${nextHeight}px`;
        composer.style.overflowY = composer.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [draft]);

    useEffect(() => {
        setPluginDraftActionHandlers({ insertDraft: insertText, setDraft });

        return () => setPluginDraftActionHandlers({});
    }, [draft]);

    useEffect(() => {
        setDraft("");
        clearStagedImages();
        clearPendingAuthorNoteSave();
        setIsAuthorNoteOpen(false);
        setIsOptionsOpen(false);
    }, [resetKey]);

    useEffect(() => {
        const nextAuthorNote = authorNoteFromProp(authorNote);

        lastSavedAuthorNoteKeyRef.current = authorNoteKey(nextAuthorNote);
        setAuthorNoteContent(nextAuthorNote.content);
        setAuthorNoteDepthInput(String(nextAuthorNote.depth ?? 0));
        setAuthorNoteRole(nextAuthorNote.role ?? "system");
        setIsAuthorNoteEnabled(nextAuthorNote.isEnabled ?? true);
    }, [
        authorNote?.content,
        authorNote?.depth,
        authorNote?.isEnabled,
        authorNote?.role,
        resetKey,
    ]);

    useEffect(() => {
        if (!onUpdateAuthorNote) {
            return;
        }

        const nextAuthorNote = currentAuthorNote();
        const nextKey = authorNoteKey(nextAuthorNote);

        if (nextKey === lastSavedAuthorNoteKeyRef.current) {
            return;
        }

        clearPendingAuthorNoteSave();
        authorNoteSaveTimerRef.current = window.setTimeout(() => {
            authorNoteSaveTimerRef.current = undefined;
            lastSavedAuthorNoteKeyRef.current = nextKey;
            onUpdateAuthorNote(nextAuthorNote);
        }, 500);

        return clearPendingAuthorNoteSave;
    }, [
        authorNoteContent,
        authorNoteDepthInput,
        authorNoteRole,
        isAuthorNoteEnabled,
        onUpdateAuthorNote,
    ]);

    useEffect(function () {
        return () => {
            clearPendingAuthorNoteSave();
            clearStagedImages();
        };
    }, []);

    useEffect(() => {
        if (!isOptionsOpen) {
            return;
        }

        function handlePointerDown(event: PointerEvent) {
            if (!optionsRef.current?.contains(event.target as Node)) {
                setIsOptionsOpen(false);
            }
        }

        function handleDocumentKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsOptionsOpen(false);
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleDocumentKeyDown);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleDocumentKeyDown);
        };
    }, [isOptionsOpen]);

    function handleSubmit(event: SubmitEvent) {
        event.preventDefault();

        if (isGenerating) {
            abortGeneration();
            return;
        }

        submitDraft();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key !== "Enter" || disabled) {
            return;
        }

        if (enterToSend && !event.shiftKey) {
            event.preventDefault();
            void submitDraft();
            return;
        }

        if (!enterToSend && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submitDraft();
        }
    }

    function insertText(text: string) {
        const textarea = composerRef.current;

        if (!textarea) {
            setDraft(`${draft}${text}`);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const nextDraft = `${draft.slice(0, start)}${text}${draft.slice(end)}`;

        setDraft(nextDraft);

        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        });
    }

    function submitDraft() {
        const submittedDraft = draft;
        const submittedImages = stagedImages.map((image) => image.file);

        flushAuthorNoteSave();
        setDraft("");
        clearStagedImages();

        return onSubmit(submittedDraft, submittedImages);
    }

    function abortGeneration() {
        onAbortGeneration?.();
    }

    function openImagePicker() {
        setIsOptionsOpen(false);
        fileInputRef.current?.click();
    }

    function openAuthorNotePanel() {
        setIsOptionsOpen(false);
        setIsAuthorNoteOpen(true);
    }

    function clearPendingAuthorNoteSave() {
        if (authorNoteSaveTimerRef.current) {
            window.clearTimeout(authorNoteSaveTimerRef.current);
            authorNoteSaveTimerRef.current = undefined;
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
            content: overrides.content ?? authorNoteContent,
            depth: parseAuthorNoteDepthInput(
                overrides.depthInput ?? authorNoteDepthInput,
            ),
            role: overrides.role ?? authorNoteRole ?? "system",
            isEnabled: overrides.isEnabled ?? isAuthorNoteEnabled,
        };
    }

    function flushAuthorNoteSave(
        overrides: Partial<{
            content: string;
            depthInput: string;
            role: ChatAuthorNote["role"];
            isEnabled: boolean;
        }> = {},
    ) {
        if (!onUpdateAuthorNote) {
            return;
        }

        const nextAuthorNote = currentAuthorNote(overrides);
        const nextKey = authorNoteKey(nextAuthorNote);

        clearPendingAuthorNoteSave();

        if (nextKey === lastSavedAuthorNoteKeyRef.current) {
            return;
        }

        lastSavedAuthorNoteKeyRef.current = nextKey;
        onUpdateAuthorNote(nextAuthorNote);
    }

    function handleAuthorNoteDepthBlur() {
        const normalizedDepthInput = String(
            parseAuthorNoteDepthInput(authorNoteDepthInput),
        );

        setAuthorNoteDepthInput(normalizedDepthInput);
        flushAuthorNoteSave({ depthInput: normalizedDepthInput });
    }

    function stageImages(files: File[]) {
        const images = files.filter((file) => file.type.startsWith("image/"));

        if (!images.length) {
            return false;
        }

        setStagedImages((current) => [
            ...current,
            ...images.map((file) => ({
                id: crypto.randomUUID(),
                file,
                previewUrl: URL.createObjectURL(file),
            })),
        ]);

        return true;
    }

    function stageFiles(files: FileList | null) {
        const staged = stageImages(Array.from(files ?? []));

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }

        return staged;
    }

    function handlePaste(event: ClipboardEvent) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const files = items.flatMap((item) => {
            if (item.kind !== "file") {
                return [];
            }

            const file = item.getAsFile();
            return file ? [file] : [];
        });

        if (stageImages(files)) {
            event.preventDefault();
        }
    }

    function removeStagedImage(imageId: string) {
        setStagedImages((current) => {
            const target = current.find((image) => image.id === imageId);

            if (target) {
                URL.revokeObjectURL(target.previewUrl);
            }

            return current.filter((image) => image.id !== imageId);
        });
    }

    function clearStagedImages() {
        setStagedImages((current) => {
            for (const image of current) {
                URL.revokeObjectURL(image.previewUrl);
            }

            return [];
        });
    }

    const pluginActions = getPluginComposerActions();
    const pluginOptions = getPluginComposerOptions();
    const composerActionContext = {
        draft,
        insertText,
        setDraft,
        snapshot: pluginSnapshot,
        submit: submitDraft,
    };

    return (
        <form className="composer" onSubmit={handleSubmit}>
            <input
                hidden
                ref={fileInputRef}
                className="composer-file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => stageFiles(event.currentTarget.files)}
            />

            {pluginActions.length > 0 && (
                <div className="composer-plugin-actions">
                    {pluginActions.map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            title={action.label}
                            disabled={disabled}
                            onClick={() => void action.run(composerActionContext)}
                        >
                            {action.renderIcon ? action.renderIcon() : action.label}
                        </button>
                    ))}
                </div>
            )}

            {stagedImages.length > 0 && (
                <div className="composer-staged-images" aria-label="Staged images">
                    {stagedImages.map((image) => (
                        <div className="composer-staged-image" key={image.id}>
                            <img src={image.previewUrl} alt={image.file.name} />
                            <button
                                type="button"
                                title="Remove image"
                                disabled={disabled}
                                onClick={() => removeStagedImage(image.id)}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {isAuthorNoteOpen && (
                <div className="composer-author-note-panel">
                    <div className="author-note-header">
                        <span>Author Note</span>
                        <div className="author-note-toggles">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={isAuthorNoteEnabled}
                                    onChange={(event) =>
                                        setIsAuthorNoteEnabled(
                                            event.currentTarget.checked,
                                        )
                                    }
                                />
                                <span>Enable</span>
                            </label>
                            <button
                                type="button"
                                title="Close author note"
                                aria-label="Close author note"
                                onClick={() => {
                                    flushAuthorNoteSave();
                                    setIsAuthorNoteOpen(false);
                                }}
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>
                    <textarea
                        aria-label="Author note content"
                        placeholder="Author note content..."
                        value={authorNoteContent}
                        onInput={(event) =>
                            setAuthorNoteContent(event.currentTarget.value)
                        }
                        onBlur={() => flushAuthorNoteSave()}
                    />
                    <div className="author-note-footer">
                        <label>
                            <span>Depth</span>
                            <input
                                type="number"
                                min={0}
                                value={authorNoteDepthInput}
                                onInput={(event) =>
                                    setAuthorNoteDepthInput(event.currentTarget.value)
                                }
                                onBlur={handleAuthorNoteDepthBlur}
                            />
                        </label>
                        <label>
                            <span>Role</span>
                            <select
                                value={authorNoteRole}
                                onChange={(event) =>
                                    setAuthorNoteRole(
                                        event.currentTarget
                                            .value as ChatAuthorNote["role"],
                                    )
                                }
                                onBlur={() => flushAuthorNoteSave()}
                            >
                                <option value="system">system</option>
                                <option value="user">user</option>
                                <option value="assistant">assistant</option>
                            </select>
                        </label>
                    </div>
                </div>
            )}
            <div className="chat-composer-area">
                <div className="composer-options" ref={optionsRef}>
                    <button
                        type="button"
                        title="Composer options"
                        aria-label="Composer options"
                        aria-expanded={isOptionsOpen}
                        disabled={disabled}
                        className="composer-options-button"
                        onClick={() => setIsOptionsOpen((current) => !current)}
                    >
                        <Menu size={18} />
                    </button>

                    {isOptionsOpen && (
                        <div className="composer-options-menu" role="menu">
                            <button
                                type="button"
                                role="menuitem"
                                title="Attach images"
                                onClick={openImagePicker}
                            >
                                <span
                                    className="composer-options-menu-icon"
                                    aria-hidden="true"
                                >
                                    <ImagePlus size={17} />
                                </span>
                                <span>Attach images</span>
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                title="Author Note"
                                onClick={openAuthorNotePanel}
                            >
                                <span
                                    className="composer-options-menu-icon"
                                    aria-hidden="true"
                                >
                                    <FileText size={17} />
                                </span>
                                <span>Author Note</span>
                            </button>

                            {pluginOptions.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="menuitem"
                                    title={option.label}
                                    onClick={() => {
                                        setIsOptionsOpen(false);
                                        void option.run(composerActionContext);
                                    }}
                                >
                                    <span
                                        className="composer-options-menu-icon"
                                        aria-hidden="true"
                                    >
                                        {option.renderIcon ? option.renderIcon() : null}
                                    </span>
                                    <span>{option.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <textarea
                    ref={composerRef}
                    aria-label="Message"
                    disabled={disabled}
                    value={draft}
                    rows={1}
                    placeholder={
                        placeholder ||
                        (mode === "chat"
                            ? `Message ${characterName}...`
                            : "Write your next line, action, or narration...")
                    }
                    onInput={(event) =>
                        setDraft((event.currentTarget as HTMLTextAreaElement).value)
                    }
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                />

                <button
                    className="send-button"
                    type={isGenerating ? "button" : "submit"}
                    data-active={canSubmit}
                    data-state={isGenerating ? "generating" : "ready"}
                    title={
                        isGenerating
                            ? "Stop generation"
                            : hasMessageContent
                              ? "Send message"
                              : "Generate response"
                    }
                    aria-label={
                        isGenerating
                            ? "Stop generation"
                            : hasMessageContent
                              ? "Send message"
                              : "Generate response"
                    }
                    disabled={isGenerating ? false : disabled}
                    onClick={(event) => {
                        if (!isGenerating) return;

                        event.preventDefault();
                        event.stopPropagation();
                        abortGeneration();
                    }}
                >
                    {isGenerating ? <Square size={17} /> : <SendHorizonal size={18} />}
                </button>
            </div>
        </form>
    );
}
