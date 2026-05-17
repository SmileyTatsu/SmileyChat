import type { ChatAttachment } from "#frontend/types";

export function MessageAttachments(props: { attachments: ChatAttachment[] }) {
    if (props.attachments.length === 0) return;

    return (
        <div className="message-attachments">
            {props.attachments.map((attachment) => (
                <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                >
                    <img src={attachment.url} alt={attachment.name} />
                </a>
            ))}
        </div>
    );
}
