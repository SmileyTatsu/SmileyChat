import { uploadChatAttachments } from "#frontend/lib/api/client";
import type { ChatAttachment } from "#frontend/types";

export async function uploadMessageAttachments(chatId: string, images: File[]) {
    if (images.length === 0) {
        return [];
    }

    const result = await uploadChatAttachments(chatId, images);
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
