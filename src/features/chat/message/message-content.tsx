import { h } from "preact";

import {
    renderQuotedText,
    type MessageFormattingOptions,
} from "#frontend/lib/message-formatting/quote-highlighting";
import type { MessageRenderer } from "#frontend/lib/plugins/types";
import { applyMessageDisplayMiddlewares } from "#frontend/lib/plugins/registry";
import type { ChatMode, Message } from "#frontend/types";

import {
    PluginRenderSurface,
    pluginIdFromScopedId,
} from "../../plugins/plugin-error-boundary";

type MessageContentProps = {
    characterAvatarPath?: string;
    characterDialogueColor?: string;
    characterName: string;
    content: string;
    message: Message;
    messageFormatting: MessageFormattingOptions;
    mode: ChatMode;

    renderer?: MessageRenderer;
};

export function MessageContent(props: MessageContentProps) {
    const content = applyMessageDisplayMiddlewares(props.content, {
        characterAvatarPath: props.characterAvatarPath,
        characterDialogueColor: props.characterDialogueColor,
        characterName: props.characterName,
        content: props.content,
        message: props.message,
        messageFormatting: props.messageFormatting,
        mode: props.mode,
    });

    if (props.renderer) {
        return (
            <PluginRenderSurface
                pluginId={pluginIdFromScopedId(props.renderer.id)}
                resetKey={`${props.renderer.id}:${props.message.id}:${props.message.activeSwipeIndex}`}
                surface="Message renderer"
                render={() =>
                    props.renderer?.render({
                        characterAvatarPath: props.characterAvatarPath,
                        characterDialogueColor: props.characterDialogueColor,
                        characterName: props.characterName,
                        content,
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
            {renderQuotedText(h, content, {
                enabled: props.messageFormatting.highlightQuotes,
            })}
        </p>
    );
}
