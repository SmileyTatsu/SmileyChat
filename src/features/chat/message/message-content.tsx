import { h } from "preact";

import {
    renderQuotedText,
    type MessageFormattingOptions,
} from "#frontend/lib/message-formatting/quote-highlighting";
import type { MessageRenderer } from "#frontend/lib/plugins/types";
import type { ChatMode, Message } from "#frontend/types";

import {
    PluginRenderSurface,
    pluginIdFromScopedId,
} from "../../plugins/plugin-error-boundary";

type MessageContentProps = {
    characterAvatarPath?: string;
    characterName: string;
    content: string;
    message: Message;
    messageFormatting: MessageFormattingOptions;
    mode: ChatMode;

    renderer?: MessageRenderer;
};

export function MessageContent(props: MessageContentProps) {
    if (props.renderer) {
        return (
            <PluginRenderSurface
                pluginId={pluginIdFromScopedId(props.renderer.id)}
                resetKey={`${props.renderer.id}:${props.message.id}:${props.message.activeSwipeIndex}`}
                surface="Message renderer"
                render={() =>
                    props.renderer?.render({
                        characterAvatarPath: props.characterAvatarPath,
                        characterName: props.characterName,
                        content: props.content,
                        message: props.message,
                        messageFormatting: props.messageFormatting,
                        mode: props.mode,
                    })
                }
            />
        );
    }

    return (
        <p>
            {renderQuotedText(h, props.content, {
                enabled: props.messageFormatting.highlightQuotes,
            })}
        </p>
    );
}
