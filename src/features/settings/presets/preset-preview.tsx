import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import { messageContentToText } from "#frontend/lib/connections/images";

type PresetPreviewProps = {
    activeView: "compiled" | "flat";
    compiledContextPreview: string;
    compiledMessagesPreview: ChatGenerationMessage[];
};

export function PresetPreview({
    activeView,
    compiledContextPreview,
    compiledMessagesPreview,
}: PresetPreviewProps) {
    return (
        <section className="preset-preview-panel" aria-label="Preset preview">
            {activeView === "compiled" ? (
                <div className="compiled-message-list" role="tabpanel">
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
            ) : (
                <textarea
                    className="context-preview"
                    aria-label="Flat context preview"
                    role="tabpanel"
                    readOnly
                    value={compiledContextPreview}
                />
            )}
        </section>
    );
}
