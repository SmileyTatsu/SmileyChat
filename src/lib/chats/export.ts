import { getMessageAttachments, getMessageContent } from "../messages";

import { chatDisplayTitle } from "./normalize";
import type { ChatSession } from "./types";

export type ChatExportFormat = "markdown" | "json";

const modeLabels: Record<ChatSession["mode"], string> = {
    chat: "Chatting",
    rp: "Roleplaying / Storytelling",
};

export function buildChatMarkdown(chat: ChatSession, characterName?: string) {
    const title = chatDisplayTitle(chat);
    const lines: string[] = [`# ${title}`, ""];

    if (characterName) {
        lines.push(`- Character: ${characterName}`);
    }
    if (chat.members?.length) {
        lines.push(`- Members: ${chat.members.map((member) => member.name).join(", ")}`);
    }
    lines.push(`- Mode: ${modeLabels[chat.mode] ?? chat.mode}`);
    lines.push(`- Messages: ${chat.messages.length}`);
    lines.push(`- Created: ${chat.createdAt}`);
    lines.push("", "---", "");

    for (const message of chat.messages) {
        const content = stripBubbleTags(getMessageContent(message)).trim();
        const attachments = getMessageAttachments(message);

        if (!content && !attachments.length) {
            continue;
        }

        lines.push(`**${message.author}** · ${message.createdAt}`, "");

        if (content) {
            lines.push(content, "");
        }

        for (const attachment of attachments) {
            lines.push(`- [${attachment.type}] ${attachmentLabel(attachment)}`);
        }

        if (attachments.length) {
            lines.push("");
        }
    }

    return `${lines.join("\n").trimEnd()}\n`;
}

export function buildChatExportFileName(
    chat: ChatSession,
    extension: "md" | "json",
): string {
    const slug = chatDisplayTitle(chat)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

    return `${slug || "chat"}-${chat.id}.${extension}`;
}

export function downloadChatExport(
    chat: ChatSession,
    format: ChatExportFormat,
    characterName?: string,
) {
    const content =
        format === "json"
            ? `${JSON.stringify(chat, null, 2)}\n`
            : buildChatMarkdown(chat, characterName);
    const mimeType = format === "json" ? "application/json" : "text/markdown";
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = buildChatExportFileName(chat, format === "json" ? "json" : "md");
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Messages may use <msg> tags to render several bubbles; the export keeps the
// prose and drops the presentation tags.
function stripBubbleTags(content: string) {
    return content.replace(/<\/?msg\b[^>]*>/gi, "\n\n").replace(/\n{3,}/g, "\n\n");
}

function attachmentLabel(attachment: { name?: string; url: string }) {
    const fromUrl = attachment.url.split("/").pop();

    return attachment.name || fromUrl || "attachment";
}
