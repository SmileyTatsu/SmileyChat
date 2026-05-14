import type { ChatGenerationMessage } from "../../../lib/connections/types";
import type { RequestState } from "./usePresetAutosave";

type PresetPreviewProps = {
    compiledContextPreview: string;
    compiledMessagesPreview: ChatGenerationMessage[];
    requestState: RequestState;
};

export function PresetPreview({
    compiledContextPreview,
    compiledMessagesPreview,
    requestState,
}: PresetPreviewProps) {
    return (
        <section className="preset-preview-panel" aria-label="Compiled preset preview">
            <div className="preset-section-header">
                <h3>Compiled messages</h3>
                <span className="preset-save-state">
                    {requestState === "loading" ? "Saving..." : "Autosave on"}
                </span>
            </div>
            <div className="compiled-message-list">
                {compiledMessagesPreview.map((message, index) => (
                    <article
                        className="compiled-message"
                        key={`${message.role}-${index}`}
                    >
                        <strong>{message.role}</strong>
                        <pre>{message.content}</pre>
                    </article>
                ))}
            </div>
            <label>
                Flat context preview
                <textarea
                    className="context-preview"
                    readOnly
                    value={compiledContextPreview}
                />
            </label>
        </section>
    );
}
