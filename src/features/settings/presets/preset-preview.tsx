import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import { messageContentToText } from "#frontend/lib/connections/images";

type PresetPreviewProps = {
    compiledContextPreview: string;
    compiledMessagesPreview: ChatGenerationMessage[];
};

export function PresetPreview({
    compiledContextPreview,
    compiledMessagesPreview,
}: PresetPreviewProps) {
    return (
        <section className="preset-preview-panel" aria-label="Compiled preset preview">
            <div className="preset-section-header">
                <h3>Compiled messages</h3>
            </div>
            <div className="compiled-message-list">
                {compiledMessagesPreview.map((message, index) => (
                    <article
                        className="compiled-message"
                        key={`${message.role}-${index}`}
                    >
                        <strong>{message.role}</strong>
                        <pre>{messageContentToText(message.content)}</pre>
                    </article>
                ))}
            </div>
            <label
                style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    minHeight: 0,
                }}
            >
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
