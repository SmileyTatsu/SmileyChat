import { deleteChatAttachment, uploadChatAttachments } from "#frontend/lib/api/client";
import {
    isLegacyGeneratedImageUrl,
    localChatAttachmentFileName,
} from "#frontend/lib/chat-attachments";
import type { ChatAttachment } from "#frontend/types";

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
        return { attachments: [], failedCount: 0 };
    }

    const results = await Promise.allSettled(
        uniqueUrls.map(async (url, index) => {
            const file = await generatedImageUrlToFile(url, index);
            return uploadMessageAttachments(chatId, [file]);
        }),
    );

    return {
        attachments: results.flatMap((result) =>
            result.status === "fulfilled" ? result.value : [],
        ),
        failedCount: results.filter((result) => result.status === "rejected").length,
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

    return new File(
        [blob],
        `generated-image-${index + 1}.${extensionForMimeType(mimeType)}`,
        {
            type: mimeType,
        },
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
