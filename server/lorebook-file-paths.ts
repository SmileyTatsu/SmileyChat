import { join } from "node:path";

import { safeEntityFileStem } from "./entity-id";
import { lorebookBooksDir } from "./paths";

export function lorebookFilePath(lorebookId: string) {
    return join(lorebookBooksDir, `${safeEntityFileStem(lorebookId, "lorebook")}.json`);
}
