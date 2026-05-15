import { BadRequestError } from "./http";
import { createChat } from "./chat-store";
import { importSillyTavernChat } from "../src/lib/chats/import";
import type { ChatSession, ChatSummary, ChatSummaryCollection } from "../src/lib/chats/types";

export type ChatImportResult = {
    chat: ChatSession;
    summary: ChatSummary;
    chats: ChatSummaryCollection;
};

export async function importUploadedChatFile(request: Request): Promise<ChatImportResult> {
    const formData = await request.formData();

    const characterIdValue = formData.get("characterId");
    const characterId =
        typeof characterIdValue === "string" ? characterIdValue.trim() : "";

    if (!characterId) {
        throw new BadRequestError("Missing characterId for chat import.");
    }

    const fileValue = formData.get("file");

    if (typeof File === "undefined" || !(fileValue instanceof File)) {
        throw new BadRequestError("Missing chat file.");
    }

    const lowerName = fileValue.name.toLowerCase();

    if (!lowerName.endsWith(".jsonl") && !lowerName.endsWith(".json")) {
        throw new BadRequestError(
            "Only .jsonl SillyTavern chat exports can be imported right now.",
        );
    }

    const text = await fileValue.text();
    let chat: ChatSession;

    try {
        chat = importSillyTavernChat({
            raw: text,
            characterId,
            sourceFileName: fileValue.name,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to parse chat file.";
        throw new BadRequestError(message);
    }

    return await createChat(chat);
}
