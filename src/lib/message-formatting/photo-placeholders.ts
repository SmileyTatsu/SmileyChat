import type { ChatAttachment } from "#frontend/types";

export type PhotoPlaceholderSegment =
    | { type: "text"; text: string }
    | { type: "photo"; attachment: ChatAttachment; imageIndex: number }
    | { type: "missing"; label: string };

export type ResolvedPhotoPlaceholders = {
    hasMarkers: boolean;
    placedAttachmentIds: Set<string>;
    segments: PhotoPlaceholderSegment[];
};

const photoPlaceholderPattern = /\{\{photo(?:\[(\d+)\]|:id=([^}\s]+))?\}\}/gi;

/**
 * Resolves display-oriented photo markers without ever turning message text into HTML.
 * Numeric indexes address image attachments only; file attachments do not affect them.
 */
export function resolvePhotoPlaceholders(
    content: string,
    attachments: ChatAttachment[],
    allContent = content,
): ResolvedPhotoPlaceholders {
    const images = attachments.filter((attachment) => attachment.type === "image");
    const explicitlyPlacedIds = collectExplicitPhotoIds(allContent, images);
    const placedAttachmentIds = new Set<string>();
    const segments: PhotoPlaceholderSegment[] = [];
    let hasMarkers = false;
    let cursor = 0;

    for (const match of content.matchAll(photoPlaceholderPattern)) {
        hasMarkers = true;
        const offset = match.index ?? 0;
        appendText(segments, content.slice(cursor, offset));

        const numericIndex = match[1] === undefined ? undefined : Number(match[1]);
        const stableId = match[2];

        if (numericIndex !== undefined || stableId !== undefined) {
            const attachment =
                numericIndex !== undefined
                    ? images[numericIndex]
                    : images.find((image) => image.id === stableId);

            if (attachment) {
                placedAttachmentIds.add(attachment.id);
                segments.push({
                    type: "photo",
                    attachment,
                    imageIndex: images.indexOf(attachment),
                });
            } else {
                segments.push({
                    type: "missing",
                    label:
                        numericIndex !== undefined
                            ? `Missing photo ${numericIndex}`
                            : `Missing photo ${stableId}`,
                });
            }
        } else {
            for (const attachment of images) {
                if (explicitlyPlacedIds.has(attachment.id)) continue;
                placedAttachmentIds.add(attachment.id);
                segments.push({
                    type: "photo",
                    attachment,
                    imageIndex: images.indexOf(attachment),
                });
            }
        }

        cursor = offset + match[0].length;
    }

    appendText(segments, content.slice(cursor));
    return { hasMarkers, placedAttachmentIds, segments };
}

export function getPlacedPhotoAttachmentIds(
    content: string,
    attachments: ChatAttachment[],
) {
    return resolvePhotoPlaceholders(content, attachments).placedAttachmentIds;
}

/** Converts valid numeric references to stable attachment ids at persistence edges. */
export function stabilizePhotoPlaceholders(
    content: string,
    attachments: ChatAttachment[],
) {
    const images = attachments.filter((attachment) => attachment.type === "image");

    return content.replace(photoPlaceholderPattern, (marker, numericIndex: string) => {
        if (numericIndex === undefined) return marker;
        const attachment = images[Number(numericIndex)];
        return attachment ? `{{photo:id=${attachment.id}}}` : marker;
    });
}

function collectExplicitPhotoIds(content: string, images: ChatAttachment[]) {
    const ids = new Set<string>();

    for (const match of content.matchAll(photoPlaceholderPattern)) {
        const numericIndex = match[1] === undefined ? undefined : Number(match[1]);
        const stableId = match[2];
        const attachment =
            numericIndex !== undefined
                ? images[numericIndex]
                : stableId !== undefined
                  ? images.find((image) => image.id === stableId)
                  : undefined;

        if (attachment) ids.add(attachment.id);
    }

    return ids;
}

function appendText(segments: PhotoPlaceholderSegment[], text: string) {
    if (!text) return;
    const previous = segments[segments.length - 1];

    if (previous?.type === "text") {
        previous.text += text;
    } else {
        segments.push({ type: "text", text });
    }
}
