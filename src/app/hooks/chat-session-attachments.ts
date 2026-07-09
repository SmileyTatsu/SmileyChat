import { deleteChatAttachment, uploadChatAttachments } from "#frontend/lib/api/client";
import type { ChatAttachment } from "#frontend/types";

export async function uploadMessageAttachments(chatId: string, files: File[]) {
    if (files.length === 0) {
        return [];
    }

    const result = await uploadChatAttachments(chatId, files);
    return result.attachments;
}

export function imageUrlsToAttachments(urls: string[]): ChatAttachment[] {
    return urls.map((url, index) => ({
        id: `generated-image-${index + 1}`,
        type: "image",
        url,
        name: `Generated image ${index + 1}`,
    }));
}

export async function deleteLocalChatAttachments(
    chatId: string,
    attachments: ChatAttachment[],
) {
    await Promise.allSettled(
        attachments.map(async (attachment) => {
            const fileName = localChatAttachmentFileName(attachment.url, chatId);

            if (!fileName) {
                return;
            }

            await deleteChatAttachment(chatId, fileName);
        }),
    );
}

export function localChatAttachmentFileName(url: string | undefined, chatId: string) {
    if (!url) {
        return "";
    }

    try {
        const parsed = new URL(url, "http://localhost");
        const prefix = `/api/chats/${encodeURIComponent(chatId)}/attachments/`;

        if (!parsed.pathname.startsWith(prefix)) {
            return "";
        }

        return decodeURIComponent(parsed.pathname.slice(prefix.length));
    } catch {
        return "";
    }
}
