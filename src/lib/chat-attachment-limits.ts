type AttachmentFile = Pick<File, "name" | "size" | "type">;

// TODO: Ability to remove file limits (prob using config)
// Consider doing limits per provider (future me please don't).
// For now we'll just use a single limit for all providers, and a separate limit for inline images.
export const maxChatAssetBytes = 25 * 1024 * 1024;
export const maxChatFileAssetBytes = 48 * 1024 * 1024;
export const maxChatAttachmentsPerMessage = 10;

const safeImageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"]);
const safeImageMimeTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/avif",
]);

export function validateChatAttachmentFiles<T extends AttachmentFile>(
    files: T[],
    currentCount = 0,
) {
    if (currentCount + files.length > maxChatAttachmentsPerMessage) {
        return {
            acceptedFiles: [] as T[],
            errors: [
                `A message can include up to ${maxChatAttachmentsPerMessage} attachments.`,
            ],
        };
    }

    const acceptedFiles: T[] = [];
    const errors: string[] = [];

    for (const file of files) {
        const maximumBytes = isSafeInlineImageFile(file)
            ? maxChatAssetBytes
            : maxChatFileAssetBytes;

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
