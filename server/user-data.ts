import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
    characterImportsDir,
    characterLibraryDir,
    chatAssetsDir,
    chatOrphanedDir,
    chatSessionsDir,
    personaAssetsDir,
    personaCardsDir,
    personaOrphanedDir,
    pluginsDir,
    userDataDir,
} from "./paths";

export function ensureUserData() {
    const folders = ["characters", "chats", "personas", "presets", "settings", "plugins"];

    for (const folder of folders) {
        const target = join(userDataDir, folder);

        if (!existsSync(target)) {
            mkdirSync(target, { recursive: true });
        }
    }

    for (const folder of [
        characterImportsDir,
        characterLibraryDir,
        chatAssetsDir,
        chatSessionsDir,
        chatOrphanedDir,
        personaCardsDir,
        personaAssetsDir,
        personaOrphanedDir,
        pluginsDir,
    ]) {
        if (!existsSync(folder)) {
            mkdirSync(folder, { recursive: true });
        }
    }
}
