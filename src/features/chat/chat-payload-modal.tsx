import { Braces, Check, Copy, FileText, ListTree, X } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";

import type { DebugGenerationPayload } from "#frontend/app/hooks/use-prompt-generation";
import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import type { PromptDebugBlock } from "#frontend/lib/prompt/types";
import { estimateGenerationMessage } from "#frontend/lib/prompt/token-estimator";

type ChatPayloadModalProps = {
    data: DebugGenerationPayload;
    onClose: () => void;
};

type PayloadTab = "context" | "final" | "request";

const maxInlineMediaStringLength = 240;
const base64PreviewLength = 96;

export function ChatPayloadModal({ data, onClose }: ChatPayloadModalProps) {
    const [activeTab, setActiveTab] = useState<PayloadTab>("context");
    const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
    const promptMessages = data.request.promptMessages ?? [];
    const payloadJson = useMemo(
        () => JSON.stringify(data.payload, truncateInlineMediaPayloads, 2),
        [data.payload],
    );
    const rawTextPrompt =
        typeof (data.payload as { prompt?: unknown }).prompt === "string"
            ? (data.payload as { prompt: string }).prompt
            : undefined;
    const debug = data.request.debug;
    const storyStringIncluded = promptMessages.some(
        (message) => message.formattingKind === "story",
    );
    const trimmedBlockCount = debug?.trimmedMessageIds.length ?? 0;
    const copyText = activeTab === "final" ? rawTextPrompt : payloadJson;

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
                        <h2 id="chat-payload-modal-title">Prompt Inspector</h2>
                        {data.request.formattingTemplate && (
                            <p className="field-hint">
                                Template:{" "}
                                {data.request.formattingTemplate.name ?? "Auto fallback"}
                                {data.request.formattingTemplate.reason ===
                                "activation-regex"
                                    ? " (Auto match)"
                                    : ""}
                            </p>
                        )}
                        <p>
                            {promptMessages.length} compiled blocks
                            {data.tokenContext
                                ? ` · ${data.tokenContext.modelId || "unknown model"}`
                                : ""}
                        </p>
                    </div>
                    <div className="chat-payload-header-actions">
                        {(activeTab === "request" || activeTab === "final") && (
                            <button
                                className="secondary-button chat-payload-copy-button"
                                type="button"
                                onClick={() =>
                                    void navigator.clipboard
                                        .writeText(copyText ?? "")
                                        .then(() => {
                                            setCopyState("copied");
                                            window.setTimeout(
                                                () => setCopyState("idle"),
                                                1200,
                                            );
                                        })
                                        .catch(() => {
                                            setCopyState("error");
                                            window.setTimeout(
                                                () => setCopyState("idle"),
                                                1800,
                                            );
                                        })
                                }
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
                                      : activeTab === "final"
                                        ? "Copy Final Prompt"
                                        : "Copy Request JSON"}
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
                    <div className="prompt-inspector-summary" aria-label="Prompt summary">
                        <span className="prompt-inspector-summary-item">
                            <strong>Context</strong>
                            {storyStringIncluded
                                ? "Story String compiled"
                                : "Preset prompt order compiled"}
                        </span>
                        {debug && (
                            <span className="prompt-inspector-summary-item">
                                <strong>Tokens</strong>
                                {debug.tokenEstimate.toLocaleString()} /{" "}
                                {debug.budget.tokenBudget.toLocaleString()}
                            </span>
                        )}
                        {trimmedBlockCount > 0 && (
                            <span className="prompt-inspector-summary-item warning">
                                <strong>Trimmed</strong>
                                {trimmedBlockCount} history{" "}
                                {trimmedBlockCount === 1 ? "turn" : "turns"}
                            </span>
                        )}
                    </div>
                    <div className="chat-payload-tabs" role="tablist">
                        <button
                            type="button"
                            className={activeTab === "context" ? "active" : ""}
                            role="tab"
                            aria-selected={activeTab === "context"}
                            onClick={() => setActiveTab("context")}
                        >
                            <ListTree size={15} />
                            1. Context
                        </button>
                        {rawTextPrompt !== undefined && (
                            <button
                                type="button"
                                className={activeTab === "final" ? "active" : ""}
                                role="tab"
                                aria-selected={activeTab === "final"}
                                onClick={() => setActiveTab("final")}
                            >
                                <FileText size={15} />
                                2. Final Prompt
                            </button>
                        )}
                        <button
                            type="button"
                            className={activeTab === "request" ? "active" : ""}
                            role="tab"
                            aria-selected={activeTab === "request"}
                            onClick={() => setActiveTab("request")}
                        >
                            <Braces size={15} />
                            {rawTextPrompt === undefined ? "2" : "3"}. Request
                        </button>
                    </div>

                    {activeTab === "context" ? (
                        <PromptInspectorStage
                            title="Resolved context"
                            description="The compiled Story String or preset blocks, including resolved macros, lore, injections, and retained chat history."
                        >
                            <div className="chat-payload-block-list">
                                {promptMessages.length ? (
                                    promptMessages.map((message, index) => (
                                        <PromptMessageCard
                                            key={`${message.role}-${index}`}
                                            index={index}
                                            message={message}
                                            debugBlock={data.request.debug?.blocks[index]}
                                            tokenContext={data.tokenContext}
                                        />
                                    ))
                                ) : (
                                    <p className="chat-payload-empty">
                                        No prompt messages were compiled.
                                    </p>
                                )}
                            </div>
                        </PromptInspectorStage>
                    ) : activeTab === "final" ? (
                        <PromptInspectorStage
                            title="Final text-completion prompt"
                            description="The exact prompt string after the active instruct template has applied its model-specific turn tokens."
                        >
                            <pre className="chat-payload-json">
                                <code>{rawTextPrompt}</code>
                            </pre>
                        </PromptInspectorStage>
                    ) : (
                        <PromptInspectorStage
                            title="Outbound provider request"
                            description="The request body prepared for the active provider. Large inline media is shortened only for safe display."
                        >
                            <pre className="chat-payload-json">
                                <code>{payloadJson}</code>
                            </pre>
                        </PromptInspectorStage>
                    )}
                </div>
            </section>
        </div>
    );
}

function PromptInspectorStage({
    children,
    description,
    title,
}: {
    children: ComponentChildren;
    description: string;
    title: string;
}) {
    return (
        <section className="prompt-inspector-stage" aria-label={title}>
            <header>
                <h3>{title}</h3>
                <p>{description}</p>
            </header>
            {children}
        </section>
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
    tokenContext,
}: {
    index: number;
    message: ChatGenerationMessage;
    debugBlock?: PromptDebugBlock;
    tokenContext?: import("#frontend/lib/tokenizer").TokenCountContext;
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
                <span>
                    {estimateGenerationMessage(message, tokenContext)} tokens est.
                </span>
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
