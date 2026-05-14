import { join } from "node:path";
import { safeEntityFileStem } from "./entity-id";
import { chatSessionsDir } from "./paths";

export function chatFilePath(chatId: string) {
    return join(chatSessionsDir, `${safeFileStem(chatId)}.json`);
}

export function safeFileStem(value: string) {
    return safeEntityFileStem(value, "chat");
}
