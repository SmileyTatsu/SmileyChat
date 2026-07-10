export function isLocalChatAttachmentUrl(
    url: string | undefined,
    chatId: string | undefined,
) {
    if (!url || !chatId) {
        return false;
    }

    const match = localChatAttachmentUrlPattern(chatId).exec(url);
    if (!match?.[1]) {
        return false;
    }

    try {
        return isSafeAttachmentFileName(decodeURIComponent(match[1]));
    } catch {
        return false;
    }
}

export function isAnyLocalChatAttachmentUrl(url: string | undefined) {
    if (!url) {
        return false;
    }

    const match = /^\/api\/chats\/([^/?#]+)\/attachments\/([^/?#]+)$/.exec(url);
    if (!match?.[1] || !match[2]) {
        return false;
    }

    try {
        return (
            isSafeAttachmentFileName(decodeURIComponent(match[1])) &&
            isSafeAttachmentFileName(decodeURIComponent(match[2]))
        );
    } catch {
        return false;
    }
}

/** Safe to show as an <img> (local asset or legacy generated image URL). */
export function isRenderableChatImageUrl(
    url: string | undefined,
    chatId: string | undefined,
) {
    return isLocalChatAttachmentUrl(url, chatId) || isLegacyGeneratedImageUrl(url);
}

/**
 * Legacy model-generated images stored as remote/data URLs before local materialize.
 * Never use this for type "file" attachments.
 * Also used as the fetch allowlist when materializing generated images.
 */
export function isLegacyGeneratedImageUrl(url: string | undefined) {
    if (!url) {
        return false;
    }

    if (url.startsWith("data:")) {
        return isSafeRasterDataImageUrl(url);
    }

    try {
        const protocol = new URL(url).protocol;
        return protocol === "https:" || protocol === "http:";
    } catch {
        return false;
    }
}

/** @deprecated Use isLegacyGeneratedImageUrl — same scheme rules. */
export function isSafeGeneratedImageFetchUrl(url: string | undefined) {
    return isLegacyGeneratedImageUrl(url);
}

/** Attachment allowed in stored chat JSON / UI after soft sanitize. */
export function isAllowedChatAttachmentUrl(
    type: "image" | "file" | undefined,
    url: string | undefined,
    chatId: string | undefined,
) {
    if (!type || !url) {
        return false;
    }

    if (isLocalChatAttachmentUrl(url, chatId)) {
        return true;
    }

    return type === "image" && isLegacyGeneratedImageUrl(url);
}

export function localChatAttachmentFileName(url: string | undefined, chatId: string) {
    if (!isLocalChatAttachmentUrl(url, chatId) || !url) {
        return "";
    }

    try {
        const prefix = `/api/chats/${encodeURIComponent(chatId)}/attachments/`;
        return decodeURIComponent(url.slice(prefix.length));
    } catch {
        return "";
    }
}

function isSafeRasterDataImageUrl(url: string) {
    return /^data:image\/(png|jpe?g|webp|gif|bmp|avif)(;|,)/i.test(url);
}

function localChatAttachmentUrlPattern(chatId: string) {
    return new RegExp(
        `^/api/chats/${escapeRegExp(encodeURIComponent(chatId))}/attachments/([^/?#]+)$`,
    );
}

function isSafeAttachmentFileName(value: string) {
    return (
        Boolean(value) &&
        value.trim() === value &&
        value !== "." &&
        value !== ".." &&
        !/[\\/\u0000-\u001f\u007f]/.test(value)
    );
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
