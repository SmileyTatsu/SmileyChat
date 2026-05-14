import { join } from "node:path";
import { assertSafeEntityId } from "./entity-id";
import { personaCardsDir } from "./paths";

export function personaFilePath(personaId: string) {
    assertSafeEntityId(personaId, "persona");
    return join(personaCardsDir, `${personaId}.json`);
}

export function personaIdFromPath(pathname: string) {
    const match = pathname.match(/^\/api\/personas\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : "";
}

export function personaAvatarIdFromPath(pathname: string) {
    const match = pathname.match(/^\/api\/personas\/([^/]+)\/avatar$/);
    return match ? decodeURIComponent(match[1]) : "";
}

export function safeFileStem(value: string) {
    return value.replace(/[^a-zA-Z0-9_.-]/g, "_") || "persona";
}
