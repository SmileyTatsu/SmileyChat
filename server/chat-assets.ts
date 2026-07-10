import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

import type { ChatAttachment, ChatSession, Message } from "#frontend/types";
import { isAllowedChatAttachmentUrl } from "#frontend/lib/chat-attachments";

import { BadRequestError, NotFoundError } from "./http";
import { chatAssetsDir, maxChatAssetBytes, maxChatFileAssetBytes } from "./paths";

export async function writeChatAssets(chatId: string, files: File[]) {
    const attachments: ChatAttachment[] = [];

    for (const file of files) {
        attachments.push(await writeChatAsset(chatId, file));
    }

    return attachments;
}

async function writeChatAsset(chatId: string, file: File): Promise<ChatAttachment> {
    const cleanChatId = safePathSegment(chatId);

    if (!cleanChatId) {
        throw new BadRequestError("Invalid chat id.");
    }

    const originalName = basename(file.name || "file");
    const inferredMimeType = file.type || mimeTypeFromFileName(originalName);
    const isImage = isSafeInlineImage(
        inferredMimeType,
        extname(originalName).toLowerCase(),
    );
    const maxBytes = isImage ? maxChatAssetBytes : maxChatFileAssetBytes;

    if (file.size > maxBytes) {
        throw new BadRequestError(
            isImage ? "Image attachment is too large." : "File attachment is too large.",
        );
    }

    const extension = cleanAttachmentExtension(originalName, inferredMimeType, isImage);
    const fileName = `${Bun.randomUUIDv7()}${extension}`;
    const targetDir = resolve(chatAssetsDir, cleanChatId);
    const targetPath = resolve(targetDir, fileName);

    if (
        !targetPath.startsWith(`${targetDir}\\`) &&
        !targetPath.startsWith(`${targetDir}/`)
    ) {
        throw new BadRequestError("Invalid attachment path.");
    }

    await mkdir(targetDir, { recursive: true });
    await Bun.write(targetPath, file);

    return {
        id: fileName,
        type: isImage ? "image" : "file",
        url: `/api/chats/${encodeURIComponent(cleanChatId)}/attachments/${encodeURIComponent(fileName)}`,
        ...(inferredMimeType ? { mimeType: inferredMimeType } : {}),
        ...(originalName ? { name: originalName } : {}),
        sizeBytes: file.size,
    };
}

export async function serveChatAsset(chatId: string, fileName: string) {
    const targetPath = chatAssetPath(chatId, fileName);

    const file = Bun.file(targetPath);

    if (!(await file.exists())) {
        throw new NotFoundError("Attachment not found.");
    }

    const contentType = safeInlineImageMimeType(fileName) || undefined;
    const headers = new Headers({
        "Content-Type": contentType ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
    });

    headers.set(
        "Content-Disposition",
        contentType
            ? `inline; filename="${contentDispositionFilename(fileName)}"`
            : `attachment; filename="${contentDispositionFilename(fileName)}"`,
    );

    return new Response(file, { headers });
}

export async function deleteChatAsset(chatId: string, fileName: string) {
    await rm(chatAssetPath(chatId, fileName), { force: true });
}

export async function deleteChatAssetDirectory(chatId: string) {
    const cleanChatId = safePathSegment(chatId);

    if (!cleanChatId) {
        return;
    }

    await rm(resolve(chatAssetsDir, cleanChatId), { recursive: true, force: true });
}

export async function copyChatMessageAssets(
    sourceChatId: string,
    targetChatId: string,
    messages: Message[],
) {
    const cleanSourceChatId = safePathSegment(sourceChatId);
    const cleanTargetChatId = safePathSegment(targetChatId);

    if (!cleanSourceChatId || !cleanTargetChatId) {
        throw new BadRequestError("Invalid chat id.");
    }

    const targetFiles = new Set<string>();
    const rewrittenMessages = rewriteMessageAttachmentUrls(
        cleanSourceChatId,
        cleanTargetChatId,
        messages,
        targetFiles,
    );

    if (targetFiles.size === 0) {
        return rewrittenMessages;
    }

    const targetDir = resolve(chatAssetsDir, cleanTargetChatId);
    await mkdir(targetDir, { recursive: true });

    for (const fileName of targetFiles) {
        await copyFile(
            chatAssetPath(cleanSourceChatId, fileName),
            chatAssetPath(cleanTargetChatId, fileName),
        );
    }

    return rewrittenMessages;
}

export function rewriteMessageAttachmentUrls(
    sourceChatId: string,
    targetChatId: string,
    messages: Message[],
    copiedFiles: Set<string> = new Set(),
) {
    const sourcePrefix = `/api/chats/${encodeURIComponent(sourceChatId)}/attachments/`;
    const targetPrefix = `/api/chats/${encodeURIComponent(targetChatId)}/attachments/`;

    return messages.map((message) => ({
        ...message,
        swipes: message.swipes.map((swipe) => ({
            ...swipe,
            ...(swipe.attachments
                ? {
                      attachments: swipe.attachments.map((attachment) =>
                          rewriteAttachmentUrl(
                              attachment,
                              sourcePrefix,
                              targetPrefix,
                              copiedFiles,
                          ),
                      ),
                  }
                : {}),
        })),
    }));
}

export function sanitizeChatAttachmentUrls(chat: ChatSession): ChatSession {
    return {
        ...chat,
        messages: chat.messages.map((message) => ({
            ...message,
            swipes: message.swipes.map((swipe) => {
                if (!swipe.attachments?.length) {
                    return swipe;
                }

                const attachments = swipe.attachments.filter((attachment) =>
                    isAllowedChatAttachmentUrl(attachment.type, attachment.url, chat.id),
                );
                const safeSwipe = { ...swipe };
                delete safeSwipe.attachments;

                return {
                    ...safeSwipe,
                    ...(attachments.length ? { attachments } : {}),
                };
            }),
        })),
    };
}

export async function readUploadedChatAssets(request: Request) {
    const formData = await request.formData();
    const files = formData
        .getAll("files")
        .filter((item): item is File => item instanceof File);

    if (files.length === 0) {
        const file = formData.get("file");

        if (file instanceof File) {
            return [file];
        }
    }

    if (files.length === 0) {
        throw new BadRequestError("No files were uploaded.");
    }

    return files;
}

function chatAssetPath(chatId: string, fileName: string) {
    const cleanChatId = safePathSegment(chatId);
    const cleanFileName = safePathSegment(fileName);

    if (!cleanChatId || !cleanFileName) {
        throw new BadRequestError("Invalid attachment path.");
    }

    const targetDir = resolve(chatAssetsDir, cleanChatId);
    const targetPath = resolve(targetDir, cleanFileName);

    if (
        !targetPath.startsWith(`${targetDir}\\`) &&
        !targetPath.startsWith(`${targetDir}/`)
    ) {
        throw new BadRequestError("Invalid attachment path.");
    }

    return targetPath;
}

function rewriteAttachmentUrl(
    attachment: ChatAttachment,
    sourcePrefix: string,
    targetPrefix: string,
    copiedFiles: Set<string>,
) {
    const fileName = attachment.url.startsWith(sourcePrefix)
        ? decodeURIComponent(attachment.url.slice(sourcePrefix.length))
        : "";

    if (!fileName) {
        return attachment;
    }

    const cleanFileName = safePathSegment(fileName);

    if (!cleanFileName) {
        return attachment;
    }

    copiedFiles.add(cleanFileName);

    return {
        ...attachment,
        url: `${targetPrefix}${encodeURIComponent(cleanFileName)}`,
    };
}

function safePathSegment(value: string) {
    const clean = basename(value.trim());
    return clean && clean === value.trim() ? clean : "";
}

function cleanAttachmentExtension(fileName: string, mimeType: string, isImage: boolean) {
    const extension = extname(fileName).toLowerCase();

    if (extension && /^[.][a-z0-9]{1,12}$/.test(extension)) {
        return extension;
    }

    if (!isImage) return extension || ".bin";
    if (mimeType === "image/png") return ".png";
    if (mimeType === "image/jpeg") return ".jpg";
    if (mimeType === "image/webp") return ".webp";
    if (mimeType === "image/gif") return ".gif";
    return ".img";
}

function isSafeInlineImage(mimeType: string, extension: string) {
    const mimeFromExtension = safeInlineImageMimeType(`file${extension}`);

    if (!mimeFromExtension) {
        return false;
    }

    if (!mimeType) {
        return true;
    }

    return safeInlineImageMimeTypes().has(mimeType.toLowerCase());
}

function safeInlineImageMimeType(fileName: string) {
    const extension = extname(fileName).toLowerCase();

    if (extension === ".png") return "image/png";
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    if (extension === ".webp") return "image/webp";
    if (extension === ".gif") return "image/gif";
    if (extension === ".bmp") return "image/bmp";
    if (extension === ".avif") return "image/avif";
    return "";
}

function safeInlineImageMimeTypes() {
    return new Set([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/avif",
    ]);
}

function contentDispositionFilename(fileName: string) {
    return basename(fileName).replace(/["\\\r\n]/g, "_") || "attachment";
}

function mimeTypeFromFileName(fileName: string) {
    const extension = extname(fileName).toLowerCase();

    if (extension === ".png") return "image/png";
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    if (extension === ".webp") return "image/webp";
    if (extension === ".gif") return "image/gif";
    if (extension === ".bmp") return "image/bmp";
    if (extension === ".avif") return "image/avif";
    if (extension === ".pdf") return "application/pdf";
    if (extension === ".txt") return "text/plain";
    if (extension === ".md" || extension === ".markdown") return "text/markdown";
    if (extension === ".json") return "application/json";
    if (extension === ".csv") return "text/csv";
    if (extension === ".xml") return "application/xml";
    if (extension === ".html" || extension === ".htm") return "text/html";
    return "";
}
