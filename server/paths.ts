import { join, resolve } from "node:path";

export const rootDir = resolve(import.meta.dir, "..");
export const distDir = join(rootDir, "dist");
export const userDataDir = join(rootDir, "userData");
export const defaultCharacterSeedsDir = join(
    rootDir,
    "src",
    "data",
    "default-characters",
);

export const connectionSettingsPath = join(userDataDir, "settings", "connections.json");
export const connectionSecretsPath = join(
    userDataDir,
    "settings",
    "connection-secrets.json",
);
export const presetsPath = join(userDataDir, "presets", "presets.json");
export const preferencesPath = join(userDataDir, "settings", "preferences.json");
export const characterIndexPath = join(userDataDir, "characters", "index.json");
export const characterArchivePath = join(userDataDir, "characters", "archive.json");
export const characterLibraryDir = join(userDataDir, "characters", "library");
export const characterImportsDir = join(userDataDir, "characters", "imports");
export const characterOrphanedDir = join(userDataDir, "characters", "orphaned");
export const chatIndexPath = join(userDataDir, "chats", "index.json");
export const chatSessionsDir = join(userDataDir, "chats", "sessions");
export const chatOrphanedDir = join(userDataDir, "chats", "orphaned");
export const personaIndexPath = join(userDataDir, "personas", "index.json");
export const personaCardsDir = join(userDataDir, "personas", "cards");
export const personaAssetsDir = join(userDataDir, "personas", "assets");
export const personaOrphanedDir = join(userDataDir, "personas", "orphaned");
export const pluginsDir = join(userDataDir, "plugins");
export const coreExtensionsDataDir = join(userDataDir, "settings", "core-extensions");

export const maxAvatarBytes = 20 * 1024 * 1024;
