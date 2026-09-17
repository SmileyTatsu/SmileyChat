import { Image, Sparkles } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";

import type { PluginAppSnapshot, SmileyPluginApi } from "#frontend/lib/plugins/types";

import {
    createImages,
    imageContextFromSnapshot,
    saveImagesToChat,
    writeImagePrompt,
    type ImagePromptDraft,
} from "./controller";
import { compileMasterPrompt } from "./master-prompt";
import { getImageGenerationSettings, type ImageContextMode } from "./settings";

type ImageGenerationModalProps = {
    api: SmileyPluginApi;
    close: () => void;
    snapshot?: PluginAppSnapshot;
    initialSource?: string;
    initialMode?: ImageContextMode;
};

const modes: Array<{ value: ImageContextMode; label: string }> = [
    { value: "scene", label: "Current scene" },
    { value: "last-message", label: "Last message" },
    { value: "character", label: "Character" },
    { value: "portrait", label: "Character portrait" },
    { value: "persona", label: "Persona" },
    { value: "background", label: "Background" },
    { value: "raw", label: "Raw request" },
    { value: "custom", label: "Custom" },
];

export function ImageGenerationModal({
    api,
    close,
    snapshot,
    initialSource = "",
    initialMode,
}: ImageGenerationModalProps) {
    const settings = getImageGenerationSettings();
    const [mode, setMode] = useState<ImageContextMode>(
        initialMode ?? settings.defaultMode,
    );
    const [source, setSource] = useState(initialSource);
    const [draft, setDraft] = useState<ImagePromptDraft>({
        roleMap: [],
        prompt: mode === "raw" ? initialSource : "",
        label: "",
        notes: [],
    });
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState<"write" | "generate" | "">("");

    const compiledPrompt = useMemo(() => {
        try {
            return compileMasterPrompt(settings.masterPrompt, draft.prompt);
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }, [draft.prompt, settings.masterPrompt]);

    async function writePrompt() {
        if (!snapshot) return;
        setBusy("write");
        setStatus("Writing the replaceable prompt section…");
        try {
            const nextDraft = await writeImagePrompt(api, snapshot, mode, source);
            setDraft(nextDraft);
            setStatus("Prompt ready. Review it before generating.");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy("");
        }
    }

    async function generate() {
        if (!snapshot || !draft.prompt.trim()) return;
        setBusy("generate");
        setStatus("Generating with NovelAI…");
        try {
            const outcome = await createImages(api, snapshot, draft.prompt);
            setStatus("Saving generated images to this chat…");
            await saveImagesToChat(api, outcome);
            setStatus(
                `Saved ${outcome.images.length} image${outcome.images.length === 1 ? "" : "s"}.`,
            );
        } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy("");
        }
    }

    if (!snapshot?.activeChat) {
        return <div className="sig-empty">Open a chat before generating an image.</div>;
    }

    const resolvedContext = imageContextFromSnapshot(
        snapshot,
        mode,
        source,
        !settings.includePresetContext,
    );

    return (
        <section className="sig-modal">
            <div className="sig-modal-grid">
                <div className="sig-workbench">
                    <label className="sig-field">
                        <span>Image context</span>
                        <select
                            name="image-context-mode"
                            value={mode}
                            disabled={Boolean(busy)}
                            onChange={(event) =>
                                setMode(event.currentTarget.value as ImageContextMode)
                            }
                        >
                            {modes.map((item) => (
                                <option value={item.value} key={item.value}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="sig-field">
                        <span>Request or extra direction</span>
                        <textarea
                            name="image-request"
                            autoComplete="off"
                            rows={5}
                            value={source}
                            disabled={Boolean(busy)}
                            placeholder="Example: a rainy rooftop reunion at blue hour…"
                            onInput={(event) => setSource(event.currentTarget.value)}
                        />
                    </label>

                    <button
                        className="sig-primary"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void writePrompt()}
                    >
                        <Sparkles size={16} aria-hidden="true" />
                        {busy === "write" ? "Writing…" : "Write Prompt with AI"}
                    </button>

                    <label className="sig-field sig-prompt-editor">
                        <span>Prompt insertion</span>
                        <textarea
                            name="image-prompt-insertion"
                            autoComplete="off"
                            rows={9}
                            value={draft.prompt}
                            disabled={Boolean(busy)}
                            placeholder="Only the text replacing {{prompt}} appears here…"
                            onInput={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    prompt: event.currentTarget.value,
                                }))
                            }
                        />
                    </label>

                    {draft.notes.length > 0 && (
                        <div className="sig-notes">
                            {draft.notes.map((note) => (
                                <p key={note}>{note}</p>
                            ))}
                        </div>
                    )}
                </div>

                <aside className="sig-preview">
                    <div className="sig-preview-heading">
                        <span>Compiled prompt</span>
                        <small>{settings.model}</small>
                    </div>
                    <pre>{compiledPrompt}</pre>
                    <details>
                        <summary>Context sent to the prompt writer</summary>
                        <pre>{resolvedContext}</pre>
                    </details>
                    <dl>
                        <div>
                            <dt>Canvas</dt>
                            <dd>
                                {settings.width} × {settings.height}
                            </dd>
                        </div>
                        <div>
                            <dt>Steps</dt>
                            <dd>{settings.steps}</dd>
                        </div>
                        <div>
                            <dt>Images</dt>
                            <dd>{settings.imageCount}</dd>
                        </div>
                    </dl>
                </aside>
            </div>

            <footer className="sig-modal-actions">
                <p role="status" aria-live="polite">
                    {status}
                </p>
                <button type="button" disabled={Boolean(busy)} onClick={close}>
                    Close
                </button>
                <button
                    className="sig-primary"
                    type="button"
                    disabled={Boolean(busy) || !draft.prompt.trim()}
                    onClick={() => void generate()}
                >
                    <Image size={16} aria-hidden="true" />
                    {busy === "generate" ? "Generating…" : "Generate Image"}
                </button>
            </footer>
        </section>
    );
}
