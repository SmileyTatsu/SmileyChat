import { Send } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
    getPluginComposerActions,
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
    onSubmit: (draft: string) => void | Promise<void>;
    pluginSnapshot: PluginAppSnapshot;
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
    const [draft, setDraft] = useState("");
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
        setDraft("");
    }, [resetKey]);

    function handleSubmit(event: SubmitEvent) {
        event.preventDefault();
        submitDraft();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key !== "Enter" || disabled || !draft.trim()) {
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
        setDraft("");
        return onSubmit(submittedDraft);
    }

    const pluginActions = getPluginComposerActions();

    return (
        <form className="composer" onSubmit={handleSubmit}>
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
                title={draft.trim() ? "Send message" : "Generate response"}
                disabled={disabled}
            >
                <Send size={18} />
            </button>
        </form>
    );
}
