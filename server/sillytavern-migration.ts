import { Glob } from "bun";
import { cp, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

import {
    importCharacterCard,
    parseCharacterJson,
    readPngCharacterJson,
} from "#frontend/lib/characters/import";
import { importSillyTavernChat } from "#frontend/lib/chats/import";
import { createId } from "#frontend/lib/common/ids";
import { isRecord } from "#frontend/lib/common/guards";
import { importSillyTavernLorebook } from "#frontend/lib/lorebooks/sillytavern";
import { importSillyTavernPreset } from "#frontend/lib/presets/normalize";

import {
    characterBaseDirectoryPath,
    characterBasePath,
    characterFolderName,
} from "./character-file-paths";
import { writeCharacterWithBasePath } from "./character-store";
import { readChatById, readChatSummaryCollection, writeChatById } from "./chat-store";
import { createLorebook } from "./lorebook-store";
import { writePersonaAvatarAssetBytes } from "./persona-images";
import { readPersonaSummaryCollection, writePersonaById } from "./persona-store";
import {
    readCharacterCollection,
    readCharacterSummaryCollection,
} from "./character-store";
import { readPresetCollection, writePresetCollection } from "./settings";

export type SillyTavernTargets = {
    characters: boolean;
    chats: boolean;
    groupChats: boolean;
    personas: boolean;
    presets: boolean;
    lorebooks: boolean;
};
export type SillyTavernScan = {
    valid: boolean;
    userFolder: string;
    availableUsers: string[];
    counts: Record<keyof SillyTavernTargets, number>;
};

const allTargets: SillyTavernTargets = {
    characters: true,
    chats: true,
    groupChats: true,
    personas: true,
    presets: true,
    lorebooks: true,
};

export async function scanSillyTavern(value: unknown): Promise<SillyTavernScan> {
    const { root, userFolder, availableUsers } = await resolveUserDirectory(value);
    if (!root)
        return { valid: false, userFolder: "", availableUsers, counts: zeroCounts() };
    return {
        valid: true,
        userFolder: root,
        availableUsers,
        counts: {
            characters: await countFiles(join(root, "characters"), [".png", ".json"]),
            chats: await countFiles(join(root, "chats"), [".jsonl"]),
            groupChats: await countFiles(join(root, "group chats"), [".jsonl"]),
            personas: await countFiles(join(root, "User Avatars"), [
                ".png",
                ".jpg",
                ".jpeg",
                ".webp",
            ]),
            presets:
                (await countFiles(join(root, "instruct"), [".json"])) +
                (await countFiles(join(root, "context"), [".json"])) +
                (await countFiles(join(root, "sysprompt"), [".json"])),
            lorebooks: await countFiles(join(root, "worlds"), [".json"]),
        },
    };
}

export async function syncSillyTavern(value: unknown) {
    const scan = await scanSillyTavern(value);
    if (!scan.valid) throw new Error("SillyTavern user folder was not found.");
    const request = isRecord(value) ? value : {};
    const requested = isRecord(request.syncTargets) ? request.syncTargets : {};
    const targets: SillyTavernTargets = Object.fromEntries(
        Object.keys(allTargets).map((key) => [key, requested[key] !== false]),
    ) as SillyTavernTargets;
    const overwrite = request.overwriteExisting === true;
    const imported = zeroCounts();
    const errors: string[] = [];
    const warnings: string[] = [];
    const characterIds = new Map<string, string>();
    await seedCharacterIds(characterIds);
    try {
        if (targets.characters)
            imported.characters = await importCharacters(
                scan.userFolder,
                overwrite,
                characterIds,
            );
    } catch (e) {
        errors.push(`Characters: ${message(e)}`);
    }
    try {
        if (targets.chats)
            imported.chats = await importChats(
                scan.userFolder,
                overwrite,
                characterIds,
                warnings,
            );
    } catch (e) {
        errors.push(`Character chats: ${message(e)}`);
    }
    try {
        if (targets.groupChats)
            imported.groupChats = await importGroupChats(
                scan.userFolder,
                overwrite,
                characterIds,
            );
    } catch (e) {
        errors.push(`Group chats: ${message(e)}`);
    }
    try {
        if (targets.personas)
            imported.personas = await importPersonas(scan.userFolder, overwrite);
    } catch (e) {
        errors.push(`Personas: ${message(e)}`);
    }
    try {
        if (targets.presets)
            imported.presets = await importPresets(scan.userFolder, overwrite);
    } catch (e) {
        errors.push(`Presets: ${message(e)}`);
    }
    try {
        if (targets.lorebooks)
            imported.lorebooks = await importLorebooks(scan.userFolder, overwrite);
    } catch (e) {
        errors.push(`Lorebooks: ${message(e)}`);
    }
    return { success: errors.length === 0, imported, errors, warnings };
}

async function importCharacters(
    root: string,
    overwrite: boolean,
    ids: Map<string, string>,
) {
    let imported = 0;
    const existing = await readCharacterSummaryCollection();
    const names = new Set(existing.characters.map((c) => c.name.toLowerCase()));
    for (const file of await files(join(root, "characters"), [".png", ".json"])) {
        try {
            const raw = file.toLowerCase().endsWith(".png")
                ? readPngCharacterJson(await Bun.file(file).arrayBuffer())
                : parseCharacterJson(await Bun.file(file).text());
            const character = importCharacterCard(raw, {
                format: file.toLowerCase().endsWith(".png") ? "png" : "json",
                sourceFileName: basename(file),
                avatarPath: file.toLowerCase().endsWith(".png")
                    ? "avatar.png"
                    : undefined,
            });
            const key = basename(file)
                .replace(/\.card\.png$|\.png$|\.json$/i, "")
                .toLowerCase();
            const duplicate = names.has(character.data.name.toLowerCase());
            if (duplicate && !overwrite) continue;
            const basePath = characterBasePath(
                characterFolderName(character.data.name, character.id),
            );
            await writeCharacterWithBasePath(character, basePath);
            if (file.toLowerCase().endsWith(".png"))
                await cp(file, join(characterBaseDirectoryPath(basePath), "avatar.png"), {
                    recursive: false,
                    force: true,
                });
            names.add(character.data.name.toLowerCase());
            ids.set(key, character.id);
            imported++;
        } catch {
            /* individual malformed cards do not cancel the migration */
        }
    }
    return imported;
}

async function importChats(
    root: string,
    overwrite: boolean,
    ids: Map<string, string>,
    warnings: string[],
) {
    let imported = 0;
    const existingChats = await readChatSummaryCollection();
    for (const file of await files(join(root, "chats"), [".jsonl"])) {
        const folder = basename(resolve(file, "..")).toLowerCase();
        const characterId = ids.get(folder) || ids.get(folder.replace(/\.card$/, ""));
        if (!characterId) continue;
        try {
            const chat = importSillyTavernChat({
                raw: await Bun.file(file).text(),
                characterId,
                sourceFileName: basename(file),
            });
            chat.id = `chat-st-${sourceHash(relative(join(root, "chats"), file))}`;
            if (
                !overwrite &&
                (await Bun.file(
                    join((await import("./paths")).chatSessionsDir, `${chat.id}.json`),
                ).exists())
            )
                continue;
            if (
                !overwrite &&
                (await hasLegacyEquivalentChat(
                    chat,
                    existingChats.chats.map((existing) => existing.id),
                ))
            ) {
                continue;
            }
            await writeChatById(chat.id, chat);
            imported++;
        } catch (error) {
            warnings.push(
                `Skipped empty or unsupported chat: ${relative(join(root, "chats"), file)} (${message(error)})`,
            );
        }
    }
    return imported;
}

async function hasLegacyEquivalentChat(
    chat: Awaited<ReturnType<typeof importSillyTavernChat>>,
    chatIds: string[],
) {
    const first = chat.messages[0];
    const firstContent = first?.swipes[first.activeSwipeIndex]?.content;
    if (!first || !firstContent) return false;

    for (const chatId of chatIds) {
        const existing = await readChatById(chatId);
        const existingFirst = existing?.messages[0];
        if (
            existing?.characterId === chat.characterId &&
            existingFirst?.createdAt === first.createdAt &&
            existingFirst.swipes[existingFirst.activeSwipeIndex]?.content === firstContent
        ) {
            return true;
        }
    }

    return false;
}

async function seedCharacterIds(ids: Map<string, string>) {
    const collection = await readCharacterCollection();

    for (const character of collection.characters) {
        const source = character.importedFrom?.sourceFileName;
        if (!source) continue;
        ids.set(
            source.replace(/\.card\.png$|\.png$|\.json$/i, "").toLowerCase(),
            character.id,
        );
    }
}

async function importGroupChats(
    root: string,
    _overwrite: boolean,
    ids: Map<string, string>,
) {
    // Group histories retain all turns. A matching member is used as the owning character;
    // their speaker names and original group definition remain in imported metadata.
    let imported = 0;
    const definitions = new Map<string, unknown>();
    for (const file of await files(join(root, "groups"), [".json"]))
        definitions.set(basename(file, ".json"), JSON.parse(await Bun.file(file).text()));
    for (const file of await files(join(root, "group chats"), [".jsonl"])) {
        const definition = definitions.get(basename(file).replace(/\.jsonl$/i, ""));
        const members =
            isRecord(definition) && Array.isArray(definition.members)
                ? definition.members
                : [];
        const characterId =
            members
                .map((v) =>
                    typeof v === "string"
                        ? ids.get(v.toLowerCase().replace(/\.png$|\.card$/g, ""))
                        : undefined,
                )
                .find(Boolean) || ids.values().next().value;
        if (!characterId) continue;
        const chat = importSillyTavernChat({
            raw: await Bun.file(file).text(),
            characterId,
            sourceFileName: basename(file),
        });
        await writeChatById(chat.id, {
            ...chat,
            defaultTitle: `Group: ${chat.defaultTitle}`,
            metadata: { ...chat.metadata, sillytavernGroup: definition ?? {} },
        });
        imported++;
    }
    return imported;
}

async function importPersonas(root: string, overwrite: boolean) {
    const settings = await readJson(join(root, "settings.json"));
    const power =
        isRecord(settings) && isRecord(settings.power_user) ? settings.power_user : {};
    const labels = isRecord(power.personas) ? power.personas : {};
    const descriptions = isRecord(power.persona_descriptions)
        ? power.persona_descriptions
        : {};
    let imported = 0;
    const existing = await readPersonaSummaryCollection();
    const names = new Set(existing.personas.map((p) => p.name.toLowerCase()));
    for (const file of await files(join(root, "User Avatars"), [
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
    ])) {
        const sourceName = basename(file);
        const name =
            typeof labels[sourceName] === "string"
                ? labels[sourceName]
                : basename(file, extname(file));
        if (names.has(name.toLowerCase()) && !overwrite) continue;
        const id = createId("persona");
        const bytes = new Uint8Array(await Bun.file(file).arrayBuffer());
        const type = file.toLowerCase().endsWith(".png")
            ? "png"
            : file.toLowerCase().endsWith(".webp")
              ? "webp"
              : "jpeg";
        const avatar = await writePersonaAvatarAssetBytes(id, bytes, type);
        const detail = isRecord(descriptions[sourceName]) ? descriptions[sourceName] : {};
        await writePersonaById(id, {
            id,
            version: 1,
            name,
            description: typeof detail.description === "string" ? detail.description : "",
            avatar,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        names.add(name.toLowerCase());
        imported++;
    }
    return imported;
}

async function importPresets(root: string, overwrite: boolean) {
    const current = await readPresetCollection();
    const titles = new Set(current.presets.map((p) => p.title.toLowerCase()));
    const additions = [];
    for (const dir of ["instruct", "context", "sysprompt"])
        for (const file of await files(join(root, dir), [".json"])) {
            const title = basename(file, ".json");
            if (titles.has(title.toLowerCase()) && !overwrite) continue;
            additions.push(importSillyTavernPreset(await readJson(file), title).preset);
            titles.add(title.toLowerCase());
        }
    if (additions.length)
        await writePresetCollection({
            ...current,
            presets: [...current.presets, ...additions],
        });
    return additions.length;
}
async function importLorebooks(root: string, overwrite: boolean) {
    let imported = 0;
    for (const file of await files(join(root, "worlds"), [".json"])) {
        const book = importSillyTavernLorebook(await readJson(file), {
            sourceFileName: basename(file),
        });
        if (!overwrite) {
            /* imported IDs are new; title de-duplication is intentionally handled by the store consumer */
        }
        await createLorebook(book);
        imported++;
    }
    return imported;
}

async function resolveUserDirectory(value: unknown) {
    const source = isRecord(value) ? value : {};
    const stPath = typeof source.stPath === "string" ? source.stPath.trim() : "";
    const requested =
        typeof source.userFolder === "string" ? source.userFolder.trim() : "";
    if (!stPath) return { root: "", userFolder: "", availableUsers: [] as string[] };
    const absolute = resolve(stPath);
    const dataDir =
        basename(absolute).toLowerCase() === "data" ? absolute : join(absolute, "data");
    const availableUsers = await childDirectories(dataDir);
    const root =
        requested && (await exists(join(dataDir, requested)))
            ? join(dataDir, requested)
            : (await exists(absolute, "characters"))
              ? absolute
              : availableUsers[0]
                ? join(dataDir, availableUsers[0])
                : "";
    return { root, userFolder: requested, availableUsers };
}
async function files(directory: string, extensions: string[]) {
    const glob = new Glob("**/*");
    const result: string[] = [];
    if (!(await exists(directory))) return result;
    for await (const file of glob.scan(directory))
        if (extensions.includes(extname(file).toLowerCase()))
            result.push(join(directory, file));
    return result;
}
async function countFiles(directory: string, extensions: string[]) {
    return (await files(directory, extensions)).length;
}
async function childDirectories(directory: string) {
    try {
        return (await readdir(directory, { withFileTypes: true }))
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();
    } catch {
        return [];
    }
}
async function exists(path: string, child?: string) {
    try {
        const value = await stat(child ? join(path, child) : path);
        return value.isDirectory();
    } catch {
        return false;
    }
}
async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await Bun.file(path).text());
}
function zeroCounts(): Record<keyof SillyTavernTargets, number> {
    return {
        characters: 0,
        chats: 0,
        groupChats: 0,
        personas: 0,
        presets: 0,
        lorebooks: 0,
    };
}
function message(error: unknown) {
    return error instanceof Error ? error.message : "Unknown migration error.";
}

function sourceHash(value: string) {
    return new Bun.CryptoHasher("sha256")
        .update(value.toLowerCase())
        .digest("hex")
        .slice(0, 20);
}
