import type {
    ChatGenerationMessage,
    ChatGenerationMessageContentPart,
    ChatGenerationRequest,
} from "./types";
import {
    isAnyLocalChatAttachmentUrl,
    isLegacyGeneratedImageUrl,
    isLocalChatAttachmentUrl,
} from "../chat-attachments";

export function filterLocalChatGenerationMessageAttachments(
    messages: ChatGenerationMessage[],
    chatId: string,
): ChatGenerationMessage[] {
    return messages.flatMap((message) => {
        if (typeof message.content === "string") {
            return [message];
        }

        const content = message.content.filter((part) => {
            if (part.type === "image_url") {
                return (
                    isLocalChatAttachmentUrl(part.image_url.url, chatId) ||
                    isLegacyGeneratedImageUrl(part.image_url.url)
                );
            }

            if (part.type === "file") {
                return part.file.url
                    ? isLocalChatAttachmentUrl(part.file.url, chatId)
                    : Boolean(part.file.file_data);
            }

            return true;
        });

        return content.length ? [{ ...message, content }] : [];
    });
}

export async function materializeChatGenerationMessageAttachments(
    messages: ChatGenerationMessage[],
): Promise<ChatGenerationMessage[]> {
    return Promise.all(messages.map(materializeMessageAttachments));
}

export const materializeChatGenerationMessageImages =
    materializeChatGenerationMessageAttachments;

async function materializeMessageAttachments(
    message: ChatGenerationMessage,
): Promise<ChatGenerationMessage> {
    if (typeof message.content === "string") {
        return message;
    }

    const content = await Promise.all(
        message.content.map(async (part) => {
            if (part.type === "image_url") {
                if (isAnyLocalChatAttachmentUrl(part.image_url.url)) {
                    return {
                        type: "image_url" as const,
                        image_url: {
                            url: await attachmentUrlToDataUrl(part.image_url.url),
                        },
                    };
                }

                // Legacy remote/data images are already provider-ready.
                return part;
            }

            if (
                part.type === "file" &&
                part.file.url &&
                isAnyLocalChatAttachmentUrl(part.file.url)
            ) {
                return {
                    type: "file" as const,
                    file: {
                        ...part.file,
                        file_data: await attachmentUrlToDataUrl(
                            part.file.url,
                            part.file.mime_type,
                        ),
                    },
                };
            }

            return part;
        }),
    );

    return {
        ...message,
        content,
    };
}

export function messageContentToText(content: ChatGenerationMessage["content"]): string {
    if (typeof content === "string") {
        return content;
    }

    return content
        .map((part) => {
            if (part.type === "text") return part.text;
            if (part.type === "image_url") return "[image]";
            return `[file: ${part.file.filename ?? "attachment"}]`;
        })
        .join("\n");
}

export function hasImageContent(
    messages: Array<{ content: ChatGenerationMessage["content"] }>,
) {
    return messages.some(
        (message) =>
            Array.isArray(message.content) &&
            message.content.some((part) => part.type === "image_url"),
    );
}

export function hasFileContent(
    messages: Array<{ content: ChatGenerationMessage["content"] }>,
) {
    return messages.some(
        (message) =>
            Array.isArray(message.content) &&
            message.content.some((part) => part.type === "file"),
    );
}

export async function mapFileContentParts(
    request: ChatGenerationRequest,
    mapFile: (
        file: Extract<ChatGenerationMessageContentPart, { type: "file" }>["file"],
    ) => Promise<Extract<ChatGenerationMessageContentPart, { type: "file" }>["file"]>,
): Promise<ChatGenerationRequest> {
    if (!request.promptMessages?.length) {
        return request;
    }

    return {
        ...request,
        promptMessages: await Promise.all(
            request.promptMessages.map(async (message) => {
                if (typeof message.content === "string") {
                    return message;
                }

                return {
                    ...message,
                    content: await Promise.all(
                        message.content.map(async (part) =>
                            part.type === "file"
                                ? { ...part, file: await mapFile(part.file) }
                                : part,
                        ),
                    ),
                };
            }),
        ),
    };
}

export function parseDataImageUrl(url: string) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(url);

    if (!match) {
        return undefined;
    }

    return {
        mimeType: match[1],
        data: match[2],
    };
}

export function parseDataUrl(url: string) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);

    if (!match) {
        return undefined;
    }

    return {
        mimeType: match[1],
        data: match[2],
    };
}

export async function filePartToBlob(file: {
    file_data?: string;
    mime_type?: string;
    url?: string;
}) {
    if (file.file_data) {
        const dataUrl = parseDataUrl(file.file_data);

        if (!dataUrl) {
            throw new Error("File input must be a base64 data URL.");
        }

        const binary = atob(dataUrl.data);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }

        return new Blob([bytes], { type: file.mime_type || dataUrl.mimeType });
    }

    if (file.url) {
        const response = await fetch(file.url);

        if (!response.ok) {
            throw new Error(
                `Could not read file attachment ${file.url}: ${response.status}`,
            );
        }

        return response.blob();
    }

    throw new Error("File input is missing data.");
}

async function attachmentUrlToDataUrl(url: string, preferredMimeType?: string) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Could not read chat attachment ${url}: ${response.status}`);
    }

    const blob = await response.blob();
    const mimeType =
        preferredMimeType ||
        blob.type ||
        response.headers.get("Content-Type") ||
        "image/png";
    const buffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    return `data:${mimeType};base64,${base64}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }

    return btoa(binary);
}
