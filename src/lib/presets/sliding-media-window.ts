import type { Message, ChatAttachment } from "#frontend/types";
import { getMessageAttachments } from "../messages";

export const MAX_ACTIVE_BINARY_IMAGES = 2;
export const MAX_ACTIVE_BINARY_FILES = 2;
export const MAX_ATTACHMENT_MESSAGE_DISTANCE = 6;

export type SlidingMediaWindowOptions = {
    maxActiveImages?: number;
    maxActiveFiles?: number;
    maxMessageDistance?: number;
};

/**
 * Calculates which attachment IDs across the message history qualify to have their
 * binary data (base64) materialized and sent to upstream model APIs.
 *
 * All attachments on the latest message turn (distance = 0) are always retained.
 * Older turns only retain binary if within the recent message distance and count limits.
 * All other attachments are demoted to compact, token-efficient text context markers.
 */
export function getActiveBinaryAttachmentIds(
    messages: Message[],
    options?: SlidingMediaWindowOptions,
): Set<string> {
    const maxImages = options?.maxActiveImages ?? MAX_ACTIVE_BINARY_IMAGES;
    const maxFiles = options?.maxActiveFiles ?? MAX_ACTIVE_BINARY_FILES;
    const maxDistance = options?.maxMessageDistance ?? MAX_ATTACHMENT_MESSAGE_DISTANCE;

    const activeIds = new Set<string>();
    if (!messages.length) {
        return activeIds;
    }

    let historicalImageCount = 0;
    let historicalFileCount = 0;

    // Scan backwards from newest to oldest message
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        const distance = messages.length - 1 - index;
        const attachments = getMessageAttachments(message);

        if (!attachments.length) {
            continue;
        }

        // The latest message turn always keeps all its attachments in binary format
        if (distance === 0) {
            for (const attachment of attachments) {
                activeIds.add(attachment.id);
            }
            continue;
        }

        // If beyond maximum message distance, older attachments are demoted to text
        if (distance > maxDistance) {
            continue;
        }

        // Scan attachments in reverse within historical messages
        for (let attIndex = attachments.length - 1; attIndex >= 0; attIndex--) {
            const attachment = attachments[attIndex];

            if (attachment.type === "image") {
                if (historicalImageCount < maxImages) {
                    activeIds.add(attachment.id);
                    historicalImageCount++;
                }
            } else if (attachment.type === "file") {
                if (historicalFileCount < maxFiles) {
                    activeIds.add(attachment.id);
                    historicalFileCount++;
                }
            }
        }
    }

    return activeIds;
}

/**
 * Formats an aged-out or text-demoted attachment into an honest, lightweight context marker.
 */
export function formatAttachmentContextText(attachment: ChatAttachment): string {
    const kind = attachment.type === "image" ? "image" : "file";
    const name = attachment.name?.trim();
    const desc = attachment.description?.trim();

    if (desc && name) {
        return `[Attached ${kind}: "${desc}" (${name})]`;
    }
    if (desc) {
        return `[Attached ${kind}: "${desc}"]`;
    }
    if (name) {
        return `[Attached ${kind}: ${name}]`;
    }
    return `[Attached ${kind}]`;
}

/**
 * Formats a description note for an active binary attachment so the model receives the user's roleplay context.
 */
export function formatActiveAttachmentDescription(attachment: ChatAttachment): string | undefined {
    const desc = attachment.description?.trim();
    if (!desc) {
        return undefined;
    }
    const kind = attachment.type === "image" ? "Image" : "File";
    return `[${kind} context: "${desc}"]`;
}
