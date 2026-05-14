import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { BadRequestError, writeJsonAtomic } from "./http";
import {
    characterIndexPath,
    characterLibraryDir,
    characterOrphanedDir,
    defaultCharacterSeedsDir,
} from "./paths";
import {
    characterBaseDirectoryPath,
    characterBasePath,
    characterDataPath,
    characterFolderName,
} from "./character-file-paths";
import { moveToUniquePath } from "./character-file-utils";
import { archiveCharacterIdentity } from "./character-archive";
import {
    characterToSummary,
    normalizeCharacter,
    normalizeCharacterCollection,
} from "../src/lib/characters/normalize";
import type {
    CharacterCollection,
    CharacterIndex,
    CharacterIndexEntry,
    CharacterSummaryCollection,
    SmileyCharacter,
} from "../src/lib/characters/types";
import { isRecord } from "../src/lib/common/guards";

type StoredCharacter = {
    character: SmileyCharacter;
    basePath: string;
};

export async function readCharacterCollection(): Promise<CharacterCollection> {
    const index = await readCharacterIndex();
    const characters: SmileyCharacter[] = [];

    for (const entry of index.characters) {
        const character = await readCharacterFromEntry(entry);

        if (character) {
            characters.push(character);
        }
    }

    return normalizeCharacterCollection({
        version: 1,
        activeCharacterId: index.activeCharacterId,
        characters,
    });
}

export async function writeCharacterCollection(characters: unknown) {
    const safeCharacters = normalizeCharacterCollection(characters);
    const entries: CharacterIndexEntry[] = [];

    for (const character of safeCharacters.characters) {
        const stored = await writeCharacterToLibrary(character);
        entries.push(characterToIndexEntry(stored.character, stored.basePath));
    }

    await writeCharacterIndex({
        version: 1,
        activeCharacterId: safeCharacters.activeCharacterId,
        characters: entries,
    });

    return safeCharacters;
}

export async function readCharacterSummaryCollection(): Promise<CharacterSummaryCollection> {
    const index = await readCharacterIndex();

    return {
        version: 1,
        activeCharacterId: index.activeCharacterId,
        characters: index.characters.map(indexEntryToSummary),
    };
}

export async function updateCharacterIndex(value: unknown) {
    const current = await readCharacterIndex();
    const record = isRecord(value) ? value : {};
    const requestedIds = Array.isArray(record.characterIds)
        ? record.characterIds.filter((item): item is string => typeof item === "string")
        : current.characters.map((character) => character.id);
    const entries: CharacterIndexEntry[] = [];

    for (const characterId of requestedIds) {
        const entry = current.characters.find((item) => item.id === characterId);

        if (!entry || entries.some((item) => item.id === characterId)) {
            continue;
        }

        entries.push(entry);
    }

    const requestedActiveId =
        typeof record.activeCharacterId === "string"
            ? record.activeCharacterId
            : current.activeCharacterId;
    const activeCharacterId = entries.some((entry) => entry.id === requestedActiveId)
        ? requestedActiveId
        : (entries[0]?.id ?? "");
    const index = {
        version: 1 as const,
        activeCharacterId,
        characters: entries,
    };

    await writeCharacterIndex(index);
    return index;
}

export async function readCharacterById(characterId: string) {
    const entry = await findCharacterIndexEntry(characterId);

    if (!entry) {
        return undefined;
    }

    return readCharacterFromEntry(entry);
}

export async function writeCharacterById(characterId: string, value: unknown) {
    const source = isRecord(value) ? value : {};
    const character = normalizeCharacter({
        ...source,
        id: characterId,
    });

    if (!character) {
        throw new BadRequestError("Invalid character.");
    }

    const index = await readCharacterIndex();
    const existingEntry = index.characters.find((entry) => entry.id === characterId);
    const existingCharacter = existingEntry
        ? await readCharacterFromEntry(existingEntry)
        : undefined;

    if (
        existingCharacter &&
        timestampMs(existingCharacter.updatedAt) > timestampMs(character.updatedAt)
    ) {
        return existingCharacter;
    }

    const stored = await writeCharacterToLibrary(character, existingEntry?.basePath);
    await upsertCharacterIndexEntry(stored.character, stored.basePath, {
        activeCharacterId: existingEntry ? index.activeCharacterId : stored.character.id,
    });

    return stored.character;
}

export async function createCharacter(value: unknown) {
    const character = normalizeCharacter(value);

    if (!character) {
        throw new BadRequestError("Invalid character.");
    }

    const stored = await writeCharacterToLibrary(character);
    await upsertCharacterIndexEntry(stored.character, stored.basePath, {
        activeCharacterId: stored.character.id,
    });

    return {
        character: stored.character,
        summary: characterToSummary(stored.character),
        characters: await readCharacterSummaryCollection(),
    };
}

export async function deleteCharacterById(characterId: string) {
    const index = await readCharacterIndex();
    const entry = index.characters.find((item) => item.id === characterId);

    if (!entry) {
        return undefined;
    }

    const character = await readCharacterFromEntry(entry);

    if (character) {
        await archiveCharacterIdentity(character);
    }

    await rm(characterBaseDirectoryPath(entry.basePath), {
        force: true,
        recursive: true,
    });

    const entries = index.characters.filter((item) => item.id !== characterId);

    if (entries.length === 0) {
        const emptyIndex = {
            version: 1 as const,
            activeCharacterId: "",
            characters: [],
        };

        await writeCharacterIndex(emptyIndex);
        return {
            index: emptyIndex,
            characters: await readCharacterSummaryCollection(),
        };
    }

    const nextIndex = {
        version: 1 as const,
        activeCharacterId:
            index.activeCharacterId === characterId
                ? entries[0].id
                : index.activeCharacterId,
        characters: entries,
    };

    await writeCharacterIndex(nextIndex);

    return {
        index: nextIndex,
        characters: await readCharacterSummaryCollection(),
    };
}

export async function characterBasePathById(characterId: string) {
    return (await findCharacterIndexEntry(characterId))?.basePath ?? "";
}

export async function characterDataPathById(characterId: string) {
    const basePath = await characterBasePathById(characterId);
    return basePath ? characterDataPath(basePath) : "";
}

export async function writeCharacterWithBasePath(
    character: SmileyCharacter,
    basePath: string,
) {
    const stored = await writeCharacterToLibrary(character, basePath);
    await upsertCharacterIndexEntry(stored.character, stored.basePath);
    return stored.character;
}

async function readCharacterIndex(): Promise<CharacterIndex> {
    if (existsSync(characterIndexPath)) {
        try {
            const file = Bun.file(characterIndexPath);
            return await repairCharacterIndex(normalizeCharacterIndex(await file.json()));
        } catch {
            return rebuildCharacterIndex({
                version: 1,
                activeCharacterId: "",
                characters: [],
            });
        }
    }

    const rebuiltIndex = await rebuildCharacterIndex();
    return rebuiltIndex;
}

async function repairCharacterIndex(index: CharacterIndex): Promise<CharacterIndex> {
    const entries: CharacterIndexEntry[] = [];
    let needsRebuild = index.characters.length === 0;

    for (const entry of index.characters) {
        const character = await readCharacterFromEntry(entry);

        if (!character || character.id !== entry.id) {
            needsRebuild = true;
            continue;
        }

        entries.push(characterToIndexEntry(character, entry.basePath));
    }

    if (
        !needsRebuild &&
        entries.length === index.characters.length &&
        entries.length > 0
    ) {
        const repairedIndex = {
            version: 1 as const,
            activeCharacterId: entries.some(
                (entry) => entry.id === index.activeCharacterId,
            )
                ? index.activeCharacterId
                : entries[0].id,
            characters: entries,
        };
        await writeCharacterIndex(repairedIndex);
        return repairedIndex;
    }

    return rebuildCharacterIndex(index);
}

async function rebuildCharacterIndex(
    previousIndex?: CharacterIndex,
): Promise<CharacterIndex> {
    let discovered = await discoverCharacters();

    if (!previousIndex && discovered.length === 0) {
        await seedDefaultCharacters();
        discovered = await discoverCharacters();
    }

    const previousOrder = previousIndex?.characters.map((entry) => entry.id) ?? [];
    const ordered = discovered.sort((left, right) => {
        const leftIndex = previousOrder.indexOf(left.character.id);
        const rightIndex = previousOrder.indexOf(right.character.id);

        if (leftIndex >= 0 && rightIndex >= 0) {
            return leftIndex - rightIndex;
        }

        if (leftIndex >= 0) {
            return -1;
        }

        if (rightIndex >= 0) {
            return 1;
        }

        return left.character.data.name.localeCompare(right.character.data.name);
    });
    const entries = ordered.map((stored) =>
        characterToIndexEntry(stored.character, stored.basePath),
    );

    if (entries.length === 0) {
        return {
            version: 1,
            activeCharacterId: "",
            characters: [],
        };
    }

    const previousActiveId = previousIndex?.activeCharacterId ?? "";
    const activeCharacterId = entries.some((entry) => entry.id === previousActiveId)
        ? previousActiveId
        : entries[0].id;
    const index = {
        version: 1 as const,
        activeCharacterId,
        characters: entries,
    };

    await writeCharacterIndex(index);
    return index;
}

async function discoverCharacters(): Promise<StoredCharacter[]> {
    const discovered = new Map<string, StoredCharacter>();

    await discoverLibraryCharacters(discovered);

    return Array.from(discovered.values());
}

async function seedDefaultCharacters() {
    if (!existsSync(defaultCharacterSeedsDir)) {
        return;
    }

    await mkdir(characterLibraryDir, { recursive: true });

    const seedFolders = await readdir(defaultCharacterSeedsDir, { withFileTypes: true });

    for (const seedFolder of seedFolders) {
        if (!seedFolder.isDirectory()) {
            continue;
        }

        const sourcePath = join(defaultCharacterSeedsDir, seedFolder.name);
        const targetPath = characterBaseDirectoryPath(characterBasePath(seedFolder.name));

        if (existsSync(targetPath)) {
            continue;
        }

        await cp(sourcePath, targetPath, {
            recursive: true,
            errorOnExist: false,
            force: false,
        });
    }
}

async function discoverLibraryCharacters(discovered: Map<string, StoredCharacter>) {
    if (!existsSync(characterLibraryDir)) {
        return;
    }

    const entries = await readdir(characterLibraryDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const basePath = characterBasePath(entry.name);
        const character = await readCharacterAtBasePath(basePath);

        if (!character) {
            continue;
        }

        if (discovered.has(character.id)) {
            await moveToUniquePath(
                characterBaseDirectoryPath(basePath),
                characterOrphanedDir,
                entry.name,
            );
            continue;
        }

        discovered.set(character.id, { character, basePath });
    }
}

async function findCharacterIndexEntry(characterId: string) {
    const index = await readCharacterIndex();
    return index.characters.find((entry) => entry.id === characterId);
}

async function readCharacterFromEntry(entry: CharacterIndexEntry) {
    return readCharacterAtBasePath(entry.basePath, entry.id);
}

async function readCharacterAtBasePath(basePath: string, expectedId?: string) {
    const path = characterDataPath(basePath);

    if (!existsSync(path)) {
        return undefined;
    }

    try {
        const character = normalizeCharacter(await Bun.file(path).json());

        if (expectedId && character?.id !== expectedId) {
            return undefined;
        }

        return character;
    } catch {
        return undefined;
    }
}

async function writeCharacterToLibrary(
    sourceCharacter: SmileyCharacter,
    existingBasePath?: string,
): Promise<StoredCharacter> {
    const desiredBasePath = await uniqueBasePathForCharacter(
        sourceCharacter,
        existingBasePath,
    );
    const existingDirectory =
        existingBasePath && existsSync(characterBaseDirectoryPath(existingBasePath))
            ? characterBaseDirectoryPath(existingBasePath)
            : "";
    const targetDirectory = characterBaseDirectoryPath(desiredBasePath);

    if (
        existingDirectory &&
        existingDirectory !== targetDirectory &&
        !existsSync(targetDirectory)
    ) {
        await rename(existingDirectory, targetDirectory);
    } else {
        await mkdir(targetDirectory, { recursive: true });
    }

    const character = await normalizeStoredAvatar(sourceCharacter, desiredBasePath);
    await writeJsonAtomic(characterDataPath(desiredBasePath), character);

    return {
        character,
        basePath: desiredBasePath,
    };
}

async function normalizeStoredAvatar(
    character: SmileyCharacter,
    basePath: string,
): Promise<SmileyCharacter> {
    if (!character.avatar) {
        return character;
    }

    return {
        ...character,
        avatar: {
            ...character.avatar,
            path: `/api/characters/${encodeURIComponent(character.id)}/avatar`,
        },
    };
}

async function uniqueBasePathForCharacter(
    character: SmileyCharacter,
    existingBasePath?: string,
) {
    const folderName = characterFolderName(character.data.name, character.id);
    const requestedBasePath = characterBasePath(folderName);

    if (existingBasePath === requestedBasePath) {
        return requestedBasePath;
    }

    if (!existsSync(characterBaseDirectoryPath(requestedBasePath))) {
        return requestedBasePath;
    }

    const existingCharacter = await readCharacterAtBasePath(requestedBasePath);

    if (!existingCharacter || existingCharacter.id === character.id) {
        return requestedBasePath;
    }

    for (let counter = 2; counter < 1000; counter += 1) {
        const candidate = characterBasePath(`${folderName}-${counter}`);

        if (!existsSync(characterBaseDirectoryPath(candidate))) {
            return candidate;
        }
    }

    return characterBasePath(`${folderName}-${Date.now()}`);
}

async function upsertCharacterIndexEntry(
    character: SmileyCharacter,
    basePath: string,
    options: { activeCharacterId?: string } = {},
) {
    const index = await readCharacterIndex();
    const entry = characterToIndexEntry(character, basePath);
    const entries = index.characters.some((item) => item.id === character.id)
        ? index.characters.map((item) => (item.id === character.id ? entry : item))
        : [...index.characters, entry];
    const activeCharacterId = options.activeCharacterId ?? index.activeCharacterId;

    await writeCharacterIndex({
        version: 1,
        activeCharacterId: entries.some((item) => item.id === activeCharacterId)
            ? activeCharacterId
            : entry.id,
        characters: entries,
    });
}

async function writeCharacterIndex(index: CharacterIndex) {
    await writeJsonAtomic(characterIndexPath, index);
}

function normalizeCharacterIndex(value: unknown): CharacterIndex {
    if (!isRecord(value)) {
        return {
            version: 1,
            activeCharacterId: "",
            characters: [],
        };
    }

    if (value.version === 1 && Array.isArray(value.characters)) {
        const characters = value.characters
            .map(normalizeCharacterIndexEntry)
            .filter((entry): entry is CharacterIndexEntry => Boolean(entry));
        const safeCharacters = uniqueEntriesById(characters);
        const requestedActiveId =
            typeof value.activeCharacterId === "string" ? value.activeCharacterId : "";

        return {
            version: 1,
            activeCharacterId: safeCharacters.some(
                (entry) => entry.id === requestedActiveId,
            )
                ? requestedActiveId
                : (safeCharacters[0]?.id ?? ""),
            characters: safeCharacters,
        };
    }

    return {
        version: 1,
        activeCharacterId: "",
        characters: [],
    };
}

function normalizeCharacterIndexEntry(value: unknown): CharacterIndexEntry | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = typeof value.id === "string" ? value.id : "";
    const name = typeof value.name === "string" ? value.name : "";
    const basePath = typeof value.basePath === "string" ? value.basePath : "";

    if (!id || !name || !basePath) {
        return undefined;
    }

    const updatedAt =
        typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString();

    return {
        id,
        name,
        tagline: typeof value.tagline === "string" ? value.tagline : "",
        basePath,
        ...(isRecord(value.avatar)
            ? { avatar: value.avatar as SmileyCharacter["avatar"] }
            : {}),
        ...(isRecord(value.importedFrom)
            ? { importedFrom: value.importedFrom as SmileyCharacter["importedFrom"] }
            : {}),
        updatedAt,
    };
}

function uniqueEntriesById(entries: CharacterIndexEntry[]) {
    const seen = new Set<string>();
    const unique: CharacterIndexEntry[] = [];

    for (const entry of entries) {
        if (seen.has(entry.id)) {
            continue;
        }

        seen.add(entry.id);
        unique.push(entry);
    }

    return unique;
}

function characterToIndexEntry(
    character: SmileyCharacter,
    basePath: string,
): CharacterIndexEntry {
    return {
        ...characterToSummary(character),
        basePath,
    };
}

function indexEntryToSummary(entry: CharacterIndexEntry) {
    return {
        id: entry.id,
        name: entry.name,
        tagline: entry.tagline,
        ...(entry.avatar ? { avatar: entry.avatar } : {}),
        ...(entry.importedFrom ? { importedFrom: entry.importedFrom } : {}),
        updatedAt: entry.updatedAt,
    };
}

function timestampMs(value: string) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
}
