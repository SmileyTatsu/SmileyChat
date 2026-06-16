import { ImagePlus, SendHorizonal, Square, X } from "lucide-preact";
import { memo } from "preact/compat";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

import { useEventCallback } from "#frontend/app/hooks/use-event-callback";
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
    onSubmit: (draft: string, images?: File[]) => void | Promise<void>;
    pluginSnapshot: PluginAppSnapshot;
};

type StagedImage = {
    id: string;
    file: File;
    previewUrl: string;
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
    const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);

    const hasMessageContent = draft.trim().length > 0 || stagedImages.length > 0;
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
        clearStagedImages();
    }, [resetKey]);

    useEffect(function () {
        return () => {
            clearStagedImages();
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
        const submittedImages = stagedImages.map((image) => image.file);

        setDraft("");
        clearStagedImages();

        return onSubmit(submittedDraft, submittedImages);
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

    function openImagePicker() {
        fileInputRef.current?.click();
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

    const pluginActions = useMemo(() => getPluginComposerActions(), [registryRevision]);
    const pluginOptions = useMemo(() => getPluginComposerOptions(), [registryRevision]);

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

            {pluginActions.length + pluginOptions.length > 0 && (
                <PluginComposerActions
                    disabled={disabled}
                    pluginActions={pluginActions}
                    pluginOptions={pluginOptions}
                    runComposerAction={runComposerAction}
                />
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

            <div className="chat-composer-area">
                <button
                    type="button"
                    title="Attach images"
                    aria-label="Attach images"
                    disabled={disabled}
                    className="composer-image-button"
                    onClick={openImagePicker}
                >
                    <ImagePlus size={18} />
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
