import type { ChatGenerationMessage } from "./types";

export async function materializeChatGenerationMessageImages(
    messages: ChatGenerationMessage[],
): Promise<ChatGenerationMessage[]> {
    return Promise.all(messages.map(materializeMessageImages));
}

async function materializeMessageImages(
    message: ChatGenerationMessage,
): Promise<ChatGenerationMessage> {
    if (typeof message.content === "string") {
        return message;
    }

    const content = await Promise.all(
        message.content.map(async (part) =>
            part.type === "image_url" && isLocalChatAttachmentUrl(part.image_url.url)
                ? {
                      type: "image_url" as const,
                      image_url: {
                          url: await imageUrlToDataUrl(part.image_url.url),
                      },
                  }
                : part,
        ),
    );

    return {
        ...message,
        content,
    };
}

export function messageContentToText(
    content: ChatGenerationMessage["content"],
): string {
    if (typeof content === "string") {
        return content;
    }

    return content
        .map((part) => (part.type === "text" ? part.text : "[image]"))
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

function isLocalChatAttachmentUrl(url: string) {
    return /^\/api\/chats\/[^/]+\/attachments\/[^/]+/.test(url);
}

async function imageUrlToDataUrl(url: string) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Could not read chat attachment ${url}: ${response.status}`);
    }

    const blob = await response.blob();
    const mimeType = blob.type || response.headers.get("Content-Type") || "image/png";
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
