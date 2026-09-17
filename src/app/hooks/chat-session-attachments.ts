import { deleteChatAttachment, uploadChatAttachments } from "#frontend/lib/api/client";
import {
    isLegacyGeneratedImageUrl,
    localChatAttachmentFileName,
} from "#frontend/lib/chat-attachments";
import type { ChatAttachment } from "#frontend/types";
import { clientLogger } from "#frontend/lib/logging/client-logger";
import { messageFromError } from "#frontend/lib/common/errors";

const maxGeneratedImageBytes = 25 * 1024 * 1024;

export async function uploadMessageAttachments(chatId: string, files: File[]) {
    if (files.length === 0) {
        return [];
    }

    const result = await uploadChatAttachments(chatId, files);
    return result.attachments;
}

export async function generatedImageUrlsToLocalAttachments(
    chatId: string,
    urls: string[],
) {
    const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

    if (uniqueUrls.length === 0) {
        return { attachments: [], failedCount: 0, failures: [] };
    }

    const results = await Promise.allSettled(
        uniqueUrls.map(async (url, index) => {
            const file = await generatedImageUrlToFile(url, index);
            return uploadMessageAttachments(chatId, [file]);
        }),
    );

    const failures = results.flatMap((result, index) =>
        result.status === "rejected"
            ? [{ index, message: messageFromError(result.reason) }]
            : [],
    );

    for (const failure of failures) {
        clientLogger.error("Generated image could not be saved locally", {
            chatId,
            imageNumber: failure.index + 1,
            error: failure.message,
        });
    }

    return {
        attachments: results.flatMap((result) =>
            result.status === "fulfilled" ? result.value : [],
        ),
        failedCount: failures.length,
        failures,
    };
}

export async function deleteLocalChatAttachments(
    chatId: string,
    attachments: ChatAttachment[],
) {
    const deletedAttachments: ChatAttachment[] = [];
    const failedAttachments: Array<{ attachment: ChatAttachment; error: unknown }> = [];

    for (const attachment of attachments) {
        const fileName = localChatAttachmentFileName(attachment.url, chatId);

        if (!fileName) {
            deletedAttachments.push(attachment);
            continue;
        }

        try {
            await deleteChatAttachment(chatId, fileName);
            deletedAttachments.push(attachment);
        } catch (error) {
            failedAttachments.push({ attachment, error });
        }
    }

    return { deletedAttachments, failedAttachments };
}

export async function generatedImageUrlToFile(url: string, index: number) {
    if (!isLegacyGeneratedImageUrl(url)) {
        throw new Error(`generated image ${index + 1} uses an unsupported URL scheme`);
    }

    const dataImage = decodeBase64DataImage(url, index);
    if (dataImage) {
        return imageBlobToFile(dataImage.blob, dataImage.mimeType, index);
    }

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`generated image ${index + 1} returned ${response.status}`);
    }

    const declaredSize = Number(response.headers.get("Content-Length") || 0);
    if (declaredSize > maxGeneratedImageBytes) {
        throw new Error(`generated image ${index + 1} is too large`);
    }

    const blob = await response.blob();
    if (blob.size > maxGeneratedImageBytes) {
        throw new Error(`generated image ${index + 1} is too large`);
    }
    const mimeType = normalizedMimeType(
        blob.type || response.headers.get("Content-Type") || "",
    );

    if (!isSafeGeneratedImageMimeType(mimeType)) {
        throw new Error(`generated image ${index + 1} is not a supported image type`);
    }

    return imageBlobToFile(blob, mimeType, index);
}

function decodeBase64DataImage(url: string, index: number) {
    if (!url.startsWith("data:")) return undefined;
    const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(url);
    if (!match?.[1] || match[2] === undefined) {
        throw new Error(`generated image ${index + 1} has invalid base64 image data`);
    }

    const mimeType = normalizedMimeType(match[1]);
    if (!isSafeGeneratedImageMimeType(mimeType)) {
        throw new Error(`generated image ${index + 1} is not a supported image type`);
    }
    const estimatedBytes = Math.floor((match[2].length * 3) / 4);
    if (estimatedBytes > maxGeneratedImageBytes) {
        throw new Error(`generated image ${index + 1} is too large`);
    }

    let binary: string;
    try {
        binary = atob(match[2]);
    } catch {
        throw new Error(`generated image ${index + 1} has invalid base64 image data`);
    }
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 1) {
        bytes[offset] = binary.charCodeAt(offset);
    }
    return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

function imageBlobToFile(blob: Blob, mimeType: string, index: number) {
    return new File(
        [blob],
        `generated-image-${index + 1}.${extensionForMimeType(mimeType)}`,
        { type: mimeType },
    );
}

function normalizedMimeType(value: string) {
    return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSafeGeneratedImageMimeType(value: string) {
    return [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/avif",
    ].includes(value);
}

function extensionForMimeType(value: string) {
    if (value === "image/jpeg") return "jpg";
    if (value === "image/webp") return "webp";
    if (value === "image/gif") return "gif";
    if (value === "image/bmp") return "bmp";
    if (value === "image/avif") return "avif";
    return "png";
}
