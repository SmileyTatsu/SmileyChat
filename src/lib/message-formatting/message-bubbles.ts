import { stripLeadingSpeakerPrefix } from "../presets/message-format";

export type MessageBubbleSegment = {
    id: string;
    content: string;
    delayMs?: number;
};

const MSG_TAG_DETECTION_REGEX = /<\/?msg(?:\s+[^>]*)?>/i;
const MSG_TAG_SCANNER_REGEX = /<(\/)?msg(?:\s+([^>]*))?>/gi;
const DELAY_ATTR_REGEX = /\bdelay\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/**
 * Parses a delay string into milliseconds.
 * Supports units like "1.5s", "500ms", or raw numbers like "2" (treated as seconds).
 * Returns undefined if no valid positive delay was specified.
 */
export function parseDelayMs(delayStr?: string): number | undefined {
    if (!delayStr) {
        return undefined;
    }

    const trimmed = delayStr.trim();
    if (!trimmed) {
        return undefined;
    }

    const msMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*ms$/i);
    if (msMatch) {
        const val = parseFloat(msMatch[1]);
        return Number.isFinite(val) && val > 0
            ? Math.min(Math.round(val), 60000)
            : undefined;
    }

    const secMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*s?$/i);
    if (secMatch) {
        const val = parseFloat(secMatch[1]);
        return Number.isFinite(val) && val > 0
            ? Math.min(Math.round(val * 1000), 60000)
            : undefined;
    }

    return undefined;
}

/**
 * Extracts the delay attribute value from the attributes string of a <msg ...> tag.
 */
export function extractDelayAttribute(attrs?: string): number | undefined {
    if (!attrs) {
        return undefined;
    }

    const match = attrs.match(DELAY_ATTR_REGEX);
    if (!match) {
        return undefined;
    }

    const value = match[1] ?? match[2] ?? match[3];
    return parseDelayMs(value);
}

/**
 * Checks if the content string contains any <msg> or </msg> tags.
 */
export function hasMessageBubbles(content: string): boolean {
    return MSG_TAG_DETECTION_REGEX.test(content);
}

/**
 * Parses message content into one or more visual message bubbles.
 *
 * If no <msg> tags are present, returns a single segment with the original content.
 * When <msg> tags are present:
 * - Content inside <msg>...</msg> is parsed as distinct bubbles.
 * - <msg delay="..."> attributes are parsed and attached to their respective bubbles.
 * - Text outside <msg> tags is preserved as bubbles if non-empty.
 * - Unclosed <msg> tags (such as during live token streaming) are treated as active bubbles.
 */
export function parseMessageBubbles(
    content: string,
    authorCandidates?: Array<string | undefined | null>,
): MessageBubbleSegment[] {
    const sanitizedContent = stripLeadingSpeakerPrefix(content, authorCandidates);
    if (!hasMessageBubbles(sanitizedContent)) {
        return [{ id: "bubble-0", content: sanitizedContent }];
    }

    const segments: MessageBubbleSegment[] = [];
    MSG_TAG_SCANNER_REGEX.lastIndex = 0;

    let lastIndex = 0;
    let inMsgTag = false;
    let currentDelayMs: number | undefined = undefined;
    let currentBuffer = "";

    let match: RegExpExecArray | null;
    while ((match = MSG_TAG_SCANNER_REGEX.exec(sanitizedContent)) !== null) {
        const [fullMatch, isClosing, attrs] = match;
        const matchIndex = match.index;
        const textBefore = sanitizedContent.slice(lastIndex, matchIndex);

        if (inMsgTag) {
            currentBuffer += textBefore;
        } else {
            const untagged = textBefore.trim();
            if (untagged.length > 0) {
                segments.push({
                    id: `bubble-${segments.length}`,
                    content: untagged,
                });
            }
        }

        if (isClosing) {
            if (inMsgTag) {
                const bubbleText = currentBuffer.trim();
                if (bubbleText.length > 0) {
                    segments.push({
                        id: `bubble-${segments.length}`,
                        content: bubbleText,
                        ...(currentDelayMs !== undefined
                            ? { delayMs: currentDelayMs }
                            : {}),
                    });
                }
                inMsgTag = false;
                currentDelayMs = undefined;
                currentBuffer = "";
            }
        } else {
            // Opening <msg ...> tag
            if (inMsgTag) {
                // Nested or unclosed previous <msg> tag: commit previous buffer
                const bubbleText = currentBuffer.trim();
                if (bubbleText.length > 0) {
                    segments.push({
                        id: `bubble-${segments.length}`,
                        content: bubbleText,
                        ...(currentDelayMs !== undefined
                            ? { delayMs: currentDelayMs }
                            : {}),
                    });
                }
            }

            inMsgTag = true;
            currentDelayMs = extractDelayAttribute(attrs);
            currentBuffer = "";
        }

        lastIndex = MSG_TAG_SCANNER_REGEX.lastIndex;
    }

    const trailingText = sanitizedContent.slice(lastIndex);
    if (inMsgTag) {
        currentBuffer += trailingText;
        // In streaming situations, preserve even untrimmed trailing text if it's the active bubble,
        // but avoid completely blank initial tokens unless it's streaming.
        const trimmed = currentBuffer.trim();
        if (trimmed.length > 0) {
            segments.push({
                id: `bubble-${segments.length}`,
                content: trimmed,
                ...(currentDelayMs !== undefined ? { delayMs: currentDelayMs } : {}),
            });
        }
    } else {
        const untagged = trailingText.trim();
        if (untagged.length > 0) {
            segments.push({
                id: `bubble-${segments.length}`,
                content: untagged,
            });
        }
    }

    // If all bubbles were empty whitespace, fall back to a single segment with trimmed content
    if (segments.length === 0) {
        return [{ id: "bubble-0", content: sanitizedContent.trim() }];
    }

    return segments;
}
