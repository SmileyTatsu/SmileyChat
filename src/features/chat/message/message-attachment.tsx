import { FileText, Image, X } from "lucide-preact";

import {
    isLegacyGeneratedImageUrl,
    isLocalChatAttachmentUrl,
    isRenderableChatImageUrl,
} from "#frontend/lib/chat-attachments";
import type { ChatAttachment } from "#frontend/types";

type MessageAttachmentsProps = {
    attachments: ChatAttachment[];
    chatId: string;
    onRemoveAttachment?: (attachmentId: string) => void;
};

export function MessageAttachments({
    attachments,
    chatId,
    onRemoveAttachment,
}: MessageAttachmentsProps) {
    if (attachments.length === 0) return;

    return (
        <div className="message-attachments">
            {attachments.map((attachment) => (
                <MessageAttachmentItem
                    attachment={attachment}
                    chatId={chatId}
                    key={attachment.id}
                    onRemoveAttachment={onRemoveAttachment}
                />
            ))}
        </div>
    );
}

export function StreamingGeneratedImages({ count }: { count: number }) {
    if (count <= 0) return;

    return (
        <div className="message-attachments" aria-live="polite">
            <div
                className="message-attachment-item"
                data-kind="image"
                data-streaming="true"
            >
                <span className="message-file-attachment streaming-image-placeholder">
                    <Image size={16} />
                    <span>
                        {count === 1
                            ? "Receiving image..."
                            : `Receiving ${count} images...`}
                    </span>
                </span>
            </div>
        </div>
    );
}

function MessageAttachmentItem({
    attachment,
    chatId,
    onRemoveAttachment,
}: {
    attachment: ChatAttachment;
    chatId: string;
    onRemoveAttachment?: (attachmentId: string) => void;
}) {
    const isLocal = isLocalChatAttachmentUrl(attachment.url, chatId);
    const isLegacyImage =
        attachment.type === "image" && isLegacyGeneratedImageUrl(attachment.url);
    const canShowImage =
        attachment.type === "image" && isRenderableChatImageUrl(attachment.url, chatId);
    const canDownloadFile = attachment.type === "file" && isLocal;
    const isValid = canShowImage || canDownloadFile;

    return (
        <div
            className="message-attachment-item"
            data-kind={attachment.type}
            data-valid={isValid ? "true" : "false"}
            data-legacy={isLegacyImage && !isLocal ? "true" : "false"}
        >
            {canShowImage ? (
                isLocal ? (
                    <a href={attachment.url} target="_blank" rel="noreferrer">
                        <img src={attachment.url} alt={attachment.name} />
                    </a>
                ) : (
                    <img src={attachment.url} alt={attachment.name} />
                )
            ) : canDownloadFile ? (
                <a
                    className="message-file-attachment"
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    download={attachment.name ?? ""}
                >
                    <FileText size={16} />
                    <span>{attachment.name ?? "Attachment"}</span>
                </a>
            ) : (
                <span className="message-file-attachment invalid-attachment">
                    <FileText size={16} />
                    <span>Invalid attachment</span>
                </span>
            )}
            {onRemoveAttachment && (
                <button
                    type="button"
                    className="message-attachment-remove"
                    title="Remove attachment"
                    aria-label={`Remove ${attachment.name ?? "attachment"}`}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemoveAttachment(attachment.id);
                    }}
                >
                    <X size={13} />
                </button>
            )}
        </div>
    );
}
