type AttachmentFile = Pick<File, "name" | "size" | "type">;

/**
 * Upload limits are a user preference (Options > Settings > Attachments and
 * media). The composer validates against the same values the server enforces,
 * so raising a limit actually takes effect instead of failing during upload.
 */
export type ChatAttachmentLimits = {
    /** Inline raster images, in megabytes. */
    imageMegabytes: number;
    /** Everything else, in megabytes. */
    fileMegabytes: number;
    /** Attachments allowed on one message. */
    perMessage: number;
};

export const defaultChatAttachmentLimits: ChatAttachmentLimits = {
    imageMegabytes: 25,
    fileMegabytes: 48,
    perMessage: 10,
};

export const maxChatAssetBytes = defaultChatAttachmentLimits.imageMegabytes * 1024 * 1024;
export const maxChatFileAssetBytes =
    defaultChatAttachmentLimits.fileMegabytes * 1024 * 1024;
export const maxChatAttachmentsPerMessage = defaultChatAttachmentLimits.perMessage;

const safeImageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"]);
const safeImageMimeTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/avif",
]);

export function chatAttachmentLimitBytes(limits: ChatAttachmentLimits) {
    return {
        fileBytes: Math.round(limits.fileMegabytes * 1024 * 1024),
        imageBytes: Math.round(limits.imageMegabytes * 1024 * 1024),
        perMessage: limits.perMessage,
    };
}

export function validateChatAttachmentFiles<T extends AttachmentFile>(
    files: T[],
    currentCount = 0,
    limits: ChatAttachmentLimits = defaultChatAttachmentLimits,
) {
    const bytes = chatAttachmentLimitBytes(limits);

    if (currentCount + files.length > bytes.perMessage) {
        return {
            acceptedFiles: [] as T[],
            errors: [`A message can include up to ${bytes.perMessage} attachments.`],
        };
    }

    const acceptedFiles: T[] = [];
    const errors: string[] = [];

    for (const file of files) {
        const maximumBytes = isSafeInlineImageFile(file)
            ? bytes.imageBytes
            : bytes.fileBytes;

        if (file.size > maximumBytes) {
            errors.push(
                `${file.name || "This file"} exceeds the ${formatMegabytes(maximumBytes)} MB limit.`,
            );
            continue;
        }

        acceptedFiles.push(file);
    }

    return { acceptedFiles, errors };
}

export function isSafeInlineImageFile(file: AttachmentFile) {
    const extension = fileExtension(file.name);
    if (!safeImageExtensions.has(extension)) {
        return false;
    }

    const mimeType = file.type.trim().toLowerCase();
    return !mimeType || safeImageMimeTypes.has(mimeType);
}

function fileExtension(fileName: string) {
    const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
    return match?.[1]?.toLowerCase() ?? "";
}

function formatMegabytes(bytes: number) {
    return Math.round(bytes / (1024 * 1024));
}
