import { FileText, X } from "lucide-preact";

import type { ChatAttachment } from "#frontend/types";

type MessageAttachmentsProps = {
    attachments: ChatAttachment[];
    onRemoveAttachment?: (attachmentId: string) => void;
};

export function MessageAttachments({
    attachments,
    onRemoveAttachment,
}: MessageAttachmentsProps) {
    if (attachments.length === 0) return;

    return (
        <div className="message-attachments">
            {attachments.map((attachment) => (
                <div
                    className="message-attachment-item"
                    data-kind={attachment.type}
                    key={attachment.id}
                >
                    {attachment.type === "image" ? (
                        <a href={attachment.url} target="_blank" rel="noreferrer">
                            <img src={attachment.url} alt={attachment.name} />
                        </a>
                    ) : (
                        <a
                            className="message-file-attachment"
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <FileText size={16} />
                            <span>{attachment.name ?? "Attachment"}</span>
                        </a>
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
            ))}
        </div>
    );
}
