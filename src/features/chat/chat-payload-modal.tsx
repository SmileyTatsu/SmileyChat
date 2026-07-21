import { Braces, Check, Copy, ListTree, X } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";

import type { DebugGenerationPayload } from "#frontend/app/hooks/use-prompt-generation";
import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import type { PromptDebugBlock } from "#frontend/lib/prompt/types";
import { estimateGenerationMessage } from "#frontend/lib/prompt/token-estimator";

type ChatPayloadModalProps = {
    data: DebugGenerationPayload;
    onClose: () => void;
};

type PayloadTab = "structured" | "json";

const maxInlineMediaStringLength = 240;
const base64PreviewLength = 96;

export function ChatPayloadModal({ data, onClose }: ChatPayloadModalProps) {
    const [activeTab, setActiveTab] = useState<PayloadTab>("structured");
    const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
    const promptMessages = data.request.promptMessages ?? [];
    const payloadJson = useMemo(
        () => JSON.stringify(data.payload, truncateInlineMediaPayloads, 2),
        [data.payload],
    );

    async function copyPayloadJson() {
        try {
            await navigator.clipboard.writeText(payloadJson);
            setCopyState("copied");
            window.setTimeout(() => setCopyState("idle"), 1200);
        } catch {
            setCopyState("error");
            window.setTimeout(() => setCopyState("idle"), 1800);
        }
    }

    return (
        <div className="plugin-modal-backdrop" role="presentation" onClick={onClose}>
            <section
                className="plugin-modal chat-payload-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="chat-payload-modal-title"
                onClick={(event) => event.stopPropagation()}
            >
                <header>
                    <div>
                        <h2 id="chat-payload-modal-title">Prompt payload</h2>
                        <p>{promptMessages.length} compiled prompt blocks</p>
                    </div>
                    <div className="chat-payload-header-actions">
                        {activeTab === "json" && (
                            <button
                                className="secondary-button chat-payload-copy-button"
                                type="button"
                                onClick={() => void copyPayloadJson()}
                            >
                                {copyState === "copied" ? (
                                    <Check size={15} />
                                ) : (
                                    <Copy size={15} />
                                )}
                                {copyState === "error"
                                    ? "Copy failed"
                                    : copyState === "copied"
                                      ? "Copied"
                                      : "Copy JSON"}
                            </button>
                        )}
                        <button
                            className="icon-button"
                            type="button"
                            title="Close"
                            onClick={onClose}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </header>

                <div className="plugin-modal-body chat-payload-modal-body">
                    <div className="chat-payload-tabs" role="tablist">
                        <button
                            type="button"
                            className={activeTab === "structured" ? "active" : ""}
                            role="tab"
                            aria-selected={activeTab === "structured"}
                            onClick={() => setActiveTab("structured")}
                        >
                            <ListTree size={15} />
                            Structured
                        </button>
                        <button
                            type="button"
                            className={activeTab === "json" ? "active" : ""}
                            role="tab"
                            aria-selected={activeTab === "json"}
                            onClick={() => setActiveTab("json")}
                        >
                            <Braces size={15} />
                            JSON
                        </button>
                    </div>

                    {activeTab === "structured" ? (
                        <div className="chat-payload-block-list">
                            {promptMessages.length ? (
                                promptMessages.map((message, index) => (
                                    <PromptMessageCard
                                        key={`${message.role}-${index}`}
                                        index={index}
                                        message={message}
                                        debugBlock={data.request.debug?.blocks[index]}
                                    />
                                ))
                            ) : (
                                <p className="chat-payload-empty">
                                    No prompt messages were compiled.
                                </p>
                            )}
                        </div>
                    ) : (
                        <pre className="chat-payload-json">
                            <code>{payloadJson}</code>
                        </pre>
                    )}
                </div>
            </section>
        </div>
    );
}

function truncateInlineMediaPayloads(_key: string, value: unknown) {
    if (typeof value !== "string" || value.length <= maxInlineMediaStringLength) {
        return value;
    }

    const dataImageMatch = value.match(/^(data:[^;]+;base64,)(.+)$/);

    if (dataImageMatch) {
        return `${dataImageMatch[1]}${dataImageMatch[2].slice(
            0,
            base64PreviewLength,
        )}...(${value.length.toLocaleString()} chars, truncated)`;
    }

    if (looksLikeLargeBase64(value)) {
        return `${value.slice(0, base64PreviewLength)}...(${value.length.toLocaleString()} chars, truncated)`;
    }

    return value;
}

function looksLikeLargeBase64(value: string) {
    return (
        value.length > 2000 &&
        value.length % 4 === 0 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(value)
    );
}

function PromptMessageCard({
    index,
    message,
    debugBlock,
}: {
    index: number;
    message: ChatGenerationMessage;
    debugBlock?: PromptDebugBlock;
}) {
    return (
        <article className="chat-payload-block">
            <header>
                <span className={`prompt-role-badge role-${message.role}`}>
                    {message.role}
                </span>
                {debugBlock && (
                    <span className={`prompt-debug-origin ${debugBlock.kind}`}>
                        {debugBlock.kind === "prompt" ? "Prompt" : "Source"}:{" "}
                        {debugBlock.label}
                    </span>
                )}
                <span>Block {index + 1}</span>
                <span>{estimateGenerationMessage(message)} tokens est.</span>
            </header>
            <div className="chat-payload-content">{renderContent(message.content)}</div>
        </article>
    );
}

function renderContent(content: ChatGenerationMessage["content"]) {
    if (typeof content === "string") {
        return content || "(empty)";
    }

    return content.map((part, index) => {
        if (part.type === "text") {
            return (
                <p key={index} className="chat-payload-text-part">
                    {part.text || "(empty text)"}
                </p>
            );
        }

        if (part.type === "image_url") {
            return (
                <p key={index} className="chat-payload-image-part">
                    image_url: {part.image_url.url}
                </p>
            );
        }

        return (
            <p key={index} className="chat-payload-image-part">
                file: {part.file.filename ?? part.file.mime_type ?? "attachment"}
            </p>
        );
    });
}
