import type { Message, MessageSwipe } from "../../types";
import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import type { ChatSession } from "./types";

export type SillyTavernChatImportInput = {
    raw: string;
    characterId: string;
    sourceFileName?: string;
};

export function importSillyTavernChat({
    raw,
    characterId,
    sourceFileName,
}: SillyTavernChatImportInput): ChatSession {
    if (!characterId.trim()) {
        throw new Error("A target character is required to import a chat.");
    }

    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        throw new Error("Chat file is empty.");
    }

    const messages: Message[] = [];

    for (const line of lines) {
        let entry: unknown;

        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }

        if (!isRecord(entry)) {
            continue;
        }

        if (isSillyTavernMetadataLine(entry)) {
            continue;
        }

        if (entry.is_system === true) {
            continue;
        }

        const message = normalizeSillyTavernMessage(entry);

        if (message) {
            messages.push(message);
        }
    }

    if (messages.length === 0) {
        throw new Error("Chat file contains no importable messages.");
    }

    const now = new Date().toISOString();

    return {
        id: createId("chat"),
        version: 1,
        characterId,
        defaultTitle: deriveImportTitle(sourceFileName),
        mode: "chat",
        messages,
        createdAt: now,
        updatedAt: now,
    };
}

function isSillyTavernMetadataLine(entry: Record<string, unknown>) {
    if (isRecord(entry.chat_metadata)) {
        return true;
    }

    return (
        typeof entry.name !== "string" ||
        typeof entry.mes !== "string" ||
        typeof entry.is_user !== "boolean"
    );
}

function normalizeSillyTavernMessage(
    entry: Record<string, unknown>,
): Message | undefined {
    const author = typeof entry.name === "string" ? entry.name.trim() : "";

    if (!author) {
        return undefined;
    }

    const role: Message["role"] = entry.is_user === true ? "user" : "character";
    const messageCreatedAt = asIsoString(entry.send_date) || new Date().toISOString();
    const swipeContents = Array.isArray(entry.swipes)
        ? entry.swipes.filter((swipe): swipe is string => typeof swipe === "string")
        : [];
    const baseContent = typeof entry.mes === "string" ? entry.mes : "";
    const sourceSwipes = swipeContents.length > 0 ? swipeContents : [baseContent];
    const swipeInfos = Array.isArray(entry.swipe_info) ? entry.swipe_info : [];

    const swipes: MessageSwipe[] = sourceSwipes.map((content, index) => {
        const info = isRecord(swipeInfos[index]) ? swipeInfos[index] : undefined;
        const createdAt =
            (info && asIsoString(info.send_date)) || messageCreatedAt;

        return {
            id: createId("swipe"),
            content,
            createdAt,
        };
    });

    const rawSwipeId =
        typeof entry.swipe_id === "number" && Number.isFinite(entry.swipe_id)
            ? Math.floor(entry.swipe_id)
            : 0;
    const activeSwipeIndex = Math.max(0, Math.min(rawSwipeId, swipes.length - 1));

    return {
        id: createId(role),
        author,
        role,
        createdAt: messageCreatedAt,
        activeSwipeIndex,
        swipes,
    };
}

function deriveImportTitle(sourceFileName: string | undefined): string {
    const fallback = `Imported chat - ${formatTitleDate(new Date())}`;

    if (!sourceFileName) {
        return fallback;
    }

    const stripped = sourceFileName
        .replace(/\.jsonl$/i, "")
        .replace(/\.json$/i, "")
        .replace(/\s*-\s*\d{4}-\d{2}-\d{2}@\d{2}h\d{2}m\d{2}s\d+ms.*$/i, "")
        .replace(/\s+Branch\s*#\d+\s*$/i, "")
        .trim();

    return stripped ? `Imported: ${stripped}` : fallback;
}

function formatTitleDate(date: Date) {
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
    }).format(date);
}

function asIsoString(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }

    return Number.isFinite(Date.parse(value)) ? value : "";
}
