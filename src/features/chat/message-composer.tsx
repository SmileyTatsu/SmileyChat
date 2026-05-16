import { ImagePlus, Send, X } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
    getPluginComposerActions,
    setPluginDraftActionHandlers,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { ChatMode } from "#frontend/types";

type MessageComposerProps = {
    characterName: string;
    disabled?: boolean;
    enterToSend: boolean;
    mode: ChatMode;
    resetKey: string;
    onSubmit: (draft: string, images?: File[]) => void | Promise<void>;
    pluginSnapshot: PluginAppSnapshot;
};

type StagedImage = {
    id: string;
    file: File;
    previewUrl: string;
};

export function MessageComposer({
    characterName,
    disabled,
    enterToSend,
    mode,
    resetKey,
    onSubmit,
    pluginSnapshot,
}: MessageComposerProps) {
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState("");
    const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
    const [, setRegistryRevision] = useState(0);

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    useEffect(() => {
        const composer = composerRef.current;

        if (!composer) {
            return;
        }

        const maxHeight = 150;
        composer.style.height = "auto";
        const nextHeight = Math.min(composer.scrollHeight, maxHeight);
        composer.style.height = `${nextHeight}px`;
        composer.style.overflowY = composer.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [draft]);

    useEffect(() => {
        setPluginDraftActionHandlers({
            insertDraft: insertText,
            setDraft,
        });

        return () => setPluginDraftActionHandlers({});
    }, [draft]);

    useEffect(() => {
        setDraft("");
        clearStagedImages();
    }, [resetKey]);

    useEffect(
        () => () => {
            clearStagedImages();
        },
        [],
    );

    function handleSubmit(event: SubmitEvent) {
        event.preventDefault();
        submitDraft();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (
            event.key !== "Enter" ||
            disabled ||
            (!draft.trim() && stagedImages.length === 0)
        ) {
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
        setDraft("");
        clearStagedImages();
        return onSubmit(submittedDraft, submittedImages);
    }

    function stageFiles(files: FileList | null) {
        const images = Array.from(files ?? []).filter((file) =>
            file.type.startsWith("image/"),
        );

        if (!images.length) {
            return;
        }

        setStagedImages((current) => [
            ...current,
            ...images.map((file) => ({
                id: crypto.randomUUID(),
                file,
                previewUrl: URL.createObjectURL(file),
            })),
        ]);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
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

    return (
        <form className="composer" onSubmit={handleSubmit}>
            <input
                ref={fileInputRef}
                className="composer-file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                    stageFiles((event.currentTarget as HTMLInputElement).files)
                }
            />
            {pluginActions.length > 0 && (
                <div className="composer-plugin-actions">
                    {pluginActions.map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            title={action.label}
                            disabled={disabled}
                            onClick={() =>
                                void action.run({
                                    draft,
                                    insertText,
                                    setDraft,
                                    snapshot: pluginSnapshot,
                                    submit: submitDraft,
                                })
                            }
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
            <button
                className="attachment-button"
                type="button"
                title="Attach images"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
            >
                <ImagePlus size={18} />
            </button>
            <textarea
                ref={composerRef}
                aria-label="Message"
                disabled={disabled}
                value={draft}
                placeholder={
                    mode === "chat"
                        ? `Message ${characterName}...`
                        : "Write your next line, action, or narration..."
                }
                onInput={(event) =>
                    setDraft((event.currentTarget as HTMLTextAreaElement).value)
                }
                onKeyDown={handleKeyDown}
            />
            <button
                className="send-button"
                type="submit"
                title={
                    draft.trim() || stagedImages.length
                        ? "Send message"
                        : "Generate response"
                }
                disabled={disabled}
            >
                <Send size={18} />
            </button>
        </form>
    );
}
