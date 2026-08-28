import { join } from "node:path";

import { assertSafeEntityId } from "./entity-id";
import { personaCardsDir } from "./paths";

export function personaFilePath(personaId: string) {
    assertSafeEntityId(personaId, "persona");
    return join(personaCardsDir, `${personaId}.json`);
}
