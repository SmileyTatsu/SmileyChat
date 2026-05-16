import { mkdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import type { ChatAttachment } from "#frontend/types";

import { BadRequestError, NotFoundError } from "./http";
import { chatAssetsDir, maxChatAssetBytes } from "./paths";

export async function writeChatAssets(chatId: string, files: File[]) {
    const attachments: ChatAttachment[] = [];

    for (const file of files) {
        attachments.push(await writeChatAsset(chatId, file));
    }

    return attachments;
}

export async function writeChatAsset(
    chatId: string,
    file: File,
): Promise<ChatAttachment> {
    const cleanChatId = safePathSegment(chatId);

    if (!cleanChatId) {
        throw new BadRequestError("Invalid chat id.");
    }

    if (!file.type.startsWith("image/")) {
        throw new BadRequestError("Only image attachments are supported.");
    }

    if (file.size > maxChatAssetBytes) {
        throw new BadRequestError("Image attachment is too large.");
    }

    const originalName = basename(file.name || "image");
    const extension = cleanImageExtension(originalName, file.type);
    const fileName = `${Bun.randomUUIDv7()}${extension}`;
    const targetDir = resolve(chatAssetsDir, cleanChatId);
    const targetPath = resolve(targetDir, fileName);

    if (!targetPath.startsWith(`${targetDir}\\`) && !targetPath.startsWith(`${targetDir}/`)) {
        throw new BadRequestError("Invalid attachment path.");
    }

    await mkdir(targetDir, { recursive: true });
    await Bun.write(targetPath, file);

    return {
        id: fileName,
        type: "image",
        url: `/api/chats/${encodeURIComponent(cleanChatId)}/attachments/${encodeURIComponent(fileName)}`,
        ...(originalName ? { name: originalName } : {}),
    };
}

export async function serveChatAsset(chatId: string, fileName: string) {
    const cleanChatId = safePathSegment(chatId);
    const cleanFileName = safePathSegment(fileName);

    if (!cleanChatId || !cleanFileName) {
        throw new BadRequestError("Invalid attachment path.");
    }

    const targetDir = resolve(chatAssetsDir, cleanChatId);
    const targetPath = resolve(targetDir, cleanFileName);

    if (!targetPath.startsWith(`${targetDir}\\`) && !targetPath.startsWith(`${targetDir}/`)) {
        throw new BadRequestError("Invalid attachment path.");
    }

    const file = Bun.file(targetPath);

    if (!(await file.exists())) {
        throw new NotFoundError("Attachment not found.");
    }

    return new Response(file);
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
        throw new BadRequestError("No image files were uploaded.");
    }

    return files;
}

function safePathSegment(value: string) {
    const clean = basename(value.trim());
    return clean && clean === value.trim() ? clean : "";
}

function cleanImageExtension(fileName: string, mimeType: string) {
    const extension = extname(fileName).toLowerCase();

    if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) {
        return extension;
    }

    if (mimeType === "image/png") return ".png";
    if (mimeType === "image/jpeg") return ".jpg";
    if (mimeType === "image/webp") return ".webp";
    if (mimeType === "image/gif") return ".gif";
    return ".img";
}
