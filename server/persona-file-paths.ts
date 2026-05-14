import { join } from "node:path";
import { assertSafeEntityId } from "./entity-id";
import { personaCardsDir } from "./paths";

export function personaFilePath(personaId: string) {
    assertSafeEntityId(personaId, "persona");
    return join(personaCardsDir, `${personaId}.json`);
}

export function safeFileStem(value: string) {
    return value.replace(/[^a-zA-Z0-9_.-]/g, "_") || "persona";
}
