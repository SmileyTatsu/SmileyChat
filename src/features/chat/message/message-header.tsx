import { User } from "lucide-preact";
import type { ComponentChildren } from "preact";

import { formatShortTime } from "#frontend/lib/common/time";
import { getMessageCreatedAt } from "#frontend/lib/messages";
import type { Message } from "#frontend/types";

type MessageHeaderProps = {
    message: Message;
    showTimestamps: boolean;
    characterAvatarPath?: string;

    children: ComponentChildren;
};

export function MessageHeader(props: MessageHeaderProps) {
    const messageDateTime = getMessageCreatedAt(props.message);

    const avatar =
        props.message.role === "character"
            ? { path: props.characterAvatarPath, alt: "Character Avatar" }
            : { path: props.message.authorAvatarPath, alt: "User Persona Avatar" };

    return (
        <div className="message-header">
            <div className="message-avatar">
                {avatar.path && <img src={avatar.path} alt={avatar.alt} />}
                {!avatar.path && <User size={18} />}
            </div>

            <div className="message-meta">
                <span className="character-title">{props.message.author}</span>

                {props.showTimestamps && (
                    <time dateTime={messageDateTime}>
                        {formatShortTime(messageDateTime)}
                    </time>
                )}
            </div>

            {props.children}
        </div>
    );
}
