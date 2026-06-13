import type { ChatSummary } from "#frontend/types";

export function formatChatCount(count: number) {
    return `${count} saved chat${count === 1 ? "" : "s"}`;
}

export function normalizeFilterText(value: string) {
    return value.trim().toLocaleLowerCase();
}

export function hasDraggedFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function isCharacterCardFile(file: File) {
    const name = file.name.toLowerCase();

    return (
        name.endsWith(".json") ||
        name.endsWith(".png") ||
        file.type === "application/json" ||
        file.type === "image/png"
    );
}

export function formatChatMeta(chat: ChatSummary) {
    const messageCount = `${chat.messageCount} message${
        chat.messageCount === 1 ? "" : "s"
    }`;
    const lastMessage = formatLastMessageTime(chat.lastMessageAt);

    return lastMessage ? `${messageCount} - ${lastMessage}` : messageCount;
}

function formatLastMessageTime(value: string | undefined) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
        return "";
    }

    const now = new Date();
    const time = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });

    if (date.toDateString() === now.toDateString()) {
        return `Last today ${time}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) {
        return `Last yesterday ${time}`;
    }

    return `Last ${date.toLocaleDateString()} ${time}`;
}
