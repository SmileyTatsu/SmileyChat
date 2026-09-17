import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import { formatShortTime } from "#frontend/lib/common/time";
import {
    hasMessageBubbles,
    parseMessageBubbles,
} from "#frontend/lib/message-formatting/message-bubbles";
import {
    renderQuotedText,
    type MessageFormattingOptions,
} from "#frontend/lib/message-formatting/quote-highlighting";
import { getMessageCreatedAt } from "#frontend/lib/messages";
import type { MessageRenderer } from "#frontend/lib/plugins/types";
import { applyMessageDisplayMiddlewares } from "#frontend/lib/plugins/registry";
import type { TimeFormat } from "#frontend/lib/preferences/types";
import { stripLeadingSpeakerPrefix } from "#frontend/lib/presets/message-format";
import { findStreamingMessageDraftSignal } from "#frontend/lib/streaming-message-drafts";
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
    showTimestamps?: boolean;
    timeFormat?: TimeFormat;
    onVisibleContentChange?: () => void;
};

export function MessageContent(props: MessageContentProps) {
    const rawContent = props.messageFormatting.hideNamePrefix
        ? stripLeadingSpeakerPrefix(props.content, [
              props.characterName,
              props.message.author,
          ])
        : props.content;

    if (!hasMessageBubbles(rawContent)) {
        return <SingleMessageBubbleContent {...props} content={rawContent} />;
    }

    return <MessageSubBubbles {...props} content={rawContent} />;
}

function MessageSubBubbles(props: MessageContentProps) {
    const bubbles = useMemo(() => {
        const candidates = props.messageFormatting.hideNamePrefix
            ? [props.characterName, props.message.author]
            : undefined;
        return parseMessageBubbles(props.content, candidates).filter((bubble) => {
            const trimmed = props.messageFormatting.hideNamePrefix
                ? stripLeadingSpeakerPrefix(bubble.content, candidates).trim()
                : bubble.content.trim();
            return trimmed.length > 0;
        });
    }, [
        props.content,
        props.messageFormatting.hideNamePrefix,
        props.characterName,
        props.message.author,
    ]);

    // Determine if this message is live (actively streaming or created within the last 10 seconds)
    const isLive = useMemo(() => {
        const isStreaming =
            findStreamingMessageDraftSignal(props.message.id)?.value !== undefined;
        if (isStreaming) {
            return true;
        }
        const createdTime = new Date(props.message.createdAt).getTime();
        return !isNaN(createdTime) && Date.now() - createdTime < 10000;
    }, [props.message.id, props.message.createdAt]);

    // For historical messages, reveal all bubbles immediately. For live messages, start with 1.
    const [revealedCount, setRevealedCount] = useState(() =>
        isLive ? 1 : bubbles.length,
    );
    const [isWaitingDelay, setIsWaitingDelay] = useState(false);

    useEffect(() => {
        if (!isLive) {
            setRevealedCount(bubbles.length);
            setIsWaitingDelay(false);
            return;
        }

        if (revealedCount >= bubbles.length) {
            setIsWaitingDelay(false);
            return;
        }

        const nextBubble = bubbles[revealedCount];
        const delayMs = nextBubble?.delayMs;

        if (delayMs && delayMs > 0) {
            setIsWaitingDelay(true);
            const timer = setTimeout(() => {
                setIsWaitingDelay(false);
                setRevealedCount((count) => Math.min(count + 1, bubbles.length));
                props.onVisibleContentChange?.();
            }, delayMs);
            return () => clearTimeout(timer);
        } else {
            setRevealedCount((count) => Math.min(count + 1, bubbles.length));
            props.onVisibleContentChange?.();
        }
    }, [isLive, revealedCount, bubbles.length, props.onVisibleContentChange]);

    const messageDateTime = getMessageCreatedAt(props.message);
    const visibleBubbles = bubbles.slice(0, revealedCount);

    return (
        <div className="msg-sub-bubbles-list">
            {visibleBubbles.map((bubble, index) => {
                const isLastBubble = index === visibleBubbles.length - 1;
                return (
                    <div
                        key={bubble.id}
                        className="msg-bubble"
                        data-bubble-id={bubble.id}
                        data-bubble-index={index}
                    >
                        <SingleMessageBubbleContent {...props} content={bubble.content} />
                        {isLastBubble && props.showTimestamps && props.timeFormat && (
                            <time
                                className="bubble-timestamp"
                                dateTime={messageDateTime}
                                aria-label={formatShortTime(
                                    messageDateTime,
                                    props.timeFormat,
                                )}
                            >
                                {formatShortTime(messageDateTime, props.timeFormat)}
                            </time>
                        )}
                    </div>
                );
            })}
            {isWaitingDelay && (
                <div className="msg-bubble msg-bubble-typing" aria-label="Typing...">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                </div>
            )}
        </div>
    );
}

function SingleMessageBubbleContent(props: MessageContentProps) {
    const rawContent = props.messageFormatting.hideNamePrefix
        ? stripLeadingSpeakerPrefix(props.content, [
              props.characterName,
              props.message.author,
          ])
        : props.content;

    const content = applyMessageDisplayMiddlewares(rawContent, {
        characterAvatarPath: props.characterAvatarPath,
        characterDialogueColor: props.characterDialogueColor,
        characterName: props.characterName,
        content: rawContent,
        message: props.message,
        messageFormatting: props.messageFormatting,
        mode: props.mode,
    });

    if (props.renderer) {
        return (
            <PluginRenderSurface
                pluginId={pluginIdFromScopedId(props.renderer.id)}
                resetKey={`${props.renderer.id}:${props.message.id}:${props.message.activeSwipeIndex}:${props.content.slice(0, 16)}`}
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
