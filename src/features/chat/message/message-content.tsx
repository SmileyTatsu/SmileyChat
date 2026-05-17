import type { MessageRenderer } from "#frontend/lib/plugins/types";
import type { ChatMode, Message } from "#frontend/types";

type MessageContentProps = {
    characterAvatarPath?: string;
    characterName: string;
    content: string;
    message: Message;
    mode: ChatMode;

    renderer?: MessageRenderer;
};

export function MessageContent(props: MessageContentProps) {
    if (props.renderer) {
        return props.renderer.render({
            characterAvatarPath: props.characterAvatarPath,
            characterName: props.characterName,
            content: props.content,
            message: props.message,
            mode: props.mode,
        });
    }

    return <p>{props.content}</p>;
}
