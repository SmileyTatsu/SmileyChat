import { FileText, Paperclip, SendHorizonal, Square, X } from "lucide-preact";
import { memo } from "preact/compat";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

import { useEventCallback } from "#frontend/app/hooks/use-event-callback";
import { createId } from "#frontend/lib/common/ids";
import {
    getPluginComposerActions,
    getPluginComposerOptions,
    setPluginDraftActionHandlers,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type {
    PluginAppSnapshot,
    PluginComposerAction,
    PluginComposerActionContext,
    PluginComposerOption,
} from "#frontend/lib/plugins/types";
import type { ChatMode } from "#frontend/types";

import {
    PluginRenderSurface,
    pluginIdFromScopedId,
} from "../plugins/plugin-error-boundary";

type MessageComposerProps = {
    characterName: string;
    disabled?: boolean;
    enterToSend: boolean;
    isGenerating?: boolean;
    mode: ChatMode;
    placeholder?: string;
    resetKey: string;
    onAbortGeneration?: () => void;
    onSubmit: (draft: string, files?: File[]) => void | Promise<void>;
    pluginSnapshot: PluginAppSnapshot;
};

type StagedFile = {
    id: string;
    file: File;
    previewUrl?: string;
};

type PluginComposerActionsProps = {
    disabled?: boolean;
    pluginActions: PluginComposerAction[];
    pluginOptions: PluginComposerOption[];
    runComposerAction: (
        run: (context: PluginComposerActionContext) => void | Promise<void>,
    ) => void;
};

export const MessageComposer = memo(function MessageComposer({
    characterName,
    disabled,
    enterToSend,
    isGenerating,
    mode,
    placeholder,
    resetKey,
    onAbortGeneration,
    onSubmit,
    pluginSnapshot,
}: MessageComposerProps) {
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [draft, setDraft] = useState("");
    const [registryRevision, setRegistryRevision] = useState(0);
    const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);

    const hasMessageContent = draft.trim().length > 0 || stagedFiles.length > 0;
    const canSubmit = !disabled || isGenerating;

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    useLayoutEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;

        const maxHeight = 200;
        composer.style.height = "auto";

        const nextHeight = Math.min(composer.scrollHeight, maxHeight);
        composer.style.height = `${nextHeight}px`;
        composer.style.overflowY = composer.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [draft]);

    useEffect(() => {
        setDraft("");
        clearStagedFiles();
    }, [resetKey]);

    useEffect(function () {
        return () => {
            clearStagedFiles();
        };
    }, []);

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

    const insertText = useEventCallback((text: string) => {
        const textarea = composerRef.current;

        if (!textarea) {
            setDraft((currentDraft) => `${currentDraft}${text}`);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        setDraft(
            (currentDraft) =>
                `${currentDraft.slice(0, start)}${text}${currentDraft.slice(end)}`,
        );

        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        });
    });

    const submitDraft = useEventCallback(() => {
        const submittedDraft = draft;
        const submittedFiles = stagedFiles.map((item) => item.file);

        setDraft("");
        clearStagedFiles();

        return onSubmit(submittedDraft, submittedFiles);
    });

    const runComposerAction = useEventCallback(
        (run: (context: PluginComposerActionContext) => void | Promise<void>) =>
            void run({
                draft,
                insertText,
                setDraft,
                snapshot: pluginSnapshot,
                submit: submitDraft,
            }),
    );

    useEffect(() => {
        setPluginDraftActionHandlers({ insertDraft: insertText, setDraft });

        return () => setPluginDraftActionHandlers({});
    }, [insertText]);

    function abortGeneration() {
        onAbortGeneration?.();
    }

    function openFilePicker() {
        fileInputRef.current?.click();
    }

    function stageSelectedFiles(files: File[]) {
        if (!files.length) {
            return false;
        }

        setStagedFiles((current) => [
            ...current,
            ...files.map((file) => ({
                id: createId("staged-file"),
                file,
                ...(file.type.startsWith("image/")
                    ? { previewUrl: URL.createObjectURL(file) }
                    : {}),
            })),
        ]);

        return true;
    }

    function stageFiles(files: FileList | null) {
        const staged = stageSelectedFiles(Array.from(files ?? []));

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

        if (stageSelectedFiles(files)) {
            event.preventDefault();
        }
    }

    function removeStagedFile(fileId: string) {
        setStagedFiles((current) => {
            const target = current.find((item) => item.id === fileId);

            if (target?.previewUrl) {
                URL.revokeObjectURL(target.previewUrl);
            }

            return current.filter((item) => item.id !== fileId);
        });
    }

    function clearStagedFiles() {
        setStagedFiles((current) => {
            for (const item of current) {
                if (item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            }

            return [];
        });
    }

    const pluginActions = useMemo(() => getPluginComposerActions(), [registryRevision]);
    const pluginOptions = useMemo(() => getPluginComposerOptions(), [registryRevision]);

    return (
        <form className="composer" onSubmit={handleSubmit}>
            <input
                hidden
                ref={fileInputRef}
                className="composer-file-input"
                type="file"
                multiple
                onChange={(event) => stageFiles(event.currentTarget.files)}
            />

            {pluginActions.length + pluginOptions.length > 0 && (
                <PluginComposerActions
                    disabled={disabled}
                    pluginActions={pluginActions}
                    pluginOptions={pluginOptions}
                    runComposerAction={runComposerAction}
                />
            )}

            {stagedFiles.length > 0 && (
                <div className="composer-staged-images" aria-label="Staged files">
                    {stagedFiles.map((item) => (
                        <div
                            className="composer-staged-image"
                            data-kind={item.previewUrl ? "image" : "file"}
                            key={item.id}
                            title={item.file.name}
                        >
                            {item.previewUrl ? (
                                <img src={item.previewUrl} alt={item.file.name} />
                            ) : (
                                <>
                                    <span className="composer-staged-file-icon">
                                        <FileText size={16} />
                                    </span>
                                    <span className="composer-staged-file-name">
                                        {item.file.name}
                                    </span>
                                </>
                            )}
                            <button
                                type="button"
                                title="Remove file"
                                disabled={disabled}
                                onClick={() => removeStagedFile(item.id)}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="chat-composer-area">
                <button
                    type="button"
                    title="Attach files"
                    aria-label="Attach files"
                    disabled={disabled}
                    className="composer-image-button"
                    onClick={openFilePicker}
                >
                    <Paperclip size={18} />
                </button>

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
});

const PluginComposerActions = memo(function PluginComposerActions({
    disabled,
    pluginActions,
    pluginOptions,
    runComposerAction,
}: PluginComposerActionsProps) {
    return (
        <div className="composer-plugin-actions">
            {pluginActions.map((action) => (
                <button
                    key={action.id}
                    type="button"
                    title={action.label}
                    disabled={disabled}
                    onClick={() => runComposerAction(action.run)}
                >
                    <PluginRenderSurface
                        pluginId={pluginIdFromScopedId(action.id)}
                        resetKey={action.id}
                        fallback={action.label}
                        surface={action.label}
                        render={() =>
                            action.renderIcon ? action.renderIcon() : action.label
                        }
                    />
                </button>
            ))}
            {pluginOptions.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    title={option.label}
                    disabled={disabled}
                    onClick={() => runComposerAction(option.run)}
                >
                    <PluginRenderSurface
                        pluginId={pluginIdFromScopedId(option.id)}
                        resetKey={option.id}
                        fallback={option.label}
                        surface={option.label}
                        render={() =>
                            option.renderIcon ? option.renderIcon() : option.label
                        }
                    />
                </button>
            ))}
        </div>
    );
});
