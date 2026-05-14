import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { stableStringify } from "./character-file-utils";
import {
    avatarTypeForContentType,
    detectImageType,
    writeAvatarAssetBytes,
    type AvatarType,
} from "./character-images";
import {
    createCharacter,
    readCharacterCollection,
    readCharacterById,
    readCharacterSummaryCollection,
} from "./character-store";
import { archivedCharacterIdForFingerprint } from "./character-archive";
import { BadRequestError } from "./http";
import { characterImportsDir } from "./paths";
import {
    importCharacterCard,
    parseCharacterJson,
    readPngCharacterJson,
} from "../src/lib/characters/import";
import type {
    DroppedCharacterImportResult,
    SmileyCharacter,
} from "../src/lib/characters/types";
import { isRecord } from "../src/lib/common/guards";

type CharacterImportCandidate = {
    character: SmileyCharacter;
    raw: unknown;
    avatarBytes?: Uint8Array;
    avatarType?: AvatarType;
};

export async function importDroppedCharacterFiles(): Promise<DroppedCharacterImportResult> {
    const result: DroppedCharacterImportResult = {
        imported: 0,
        skipped: 0,
        failed: [],
    };
    const entries = await readdir(characterImportsDir, { withFileTypes: true });
    const importedFingerprints = await readImportedFingerprints();

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        const extension = extname(entry.name).toLowerCase();

        if (extension !== ".json" && extension !== ".png") {
            continue;
        }

        const sourcePath = join(characterImportsDir, entry.name);

        try {
            const candidate = await importCharacterFileFromDisk(
                sourcePath,
                entry.name,
                extension,
            );
            let imported = candidate.character;
            const fingerprint = imported.importedFrom?.fingerprint;

            if (fingerprint && importedFingerprints.has(fingerprint)) {
                result.skipped += 1;
                await rm(sourcePath, { force: true });
                continue;
            }

            imported = await attachImportedAvatar(imported, candidate);

            await createCharacter(imported);
            if (fingerprint) {
                importedFingerprints.add(fingerprint);
            }
            result.imported += 1;
            result.activeCharacterId = imported.id;
            await rm(sourcePath, { force: true });
        } catch (error) {
            result.failed.push({
                fileName: entry.name,
                error:
                    error instanceof Error ? error.message : "Unexpected import error.",
            });
        }
    }

    if (result.imported > 0) {
        result.characters = await readCharacterSummaryCollection();
    }

    return result;
}

export async function importUploadedCharacterFiles(
    request: Request,
): Promise<DroppedCharacterImportResult> {
    const formData = await request.formData();
    const files = formData
        .getAll("files")
        .filter(
            (item): item is File => typeof File !== "undefined" && item instanceof File,
        );
    const result: DroppedCharacterImportResult = {
        imported: 0,
        skipped: 0,
        failed: [],
    };
    const importedFingerprints = await readImportedFingerprints();

    for (const file of files) {
        const extension = extname(file.name).toLowerCase();

        if (extension !== ".json" && extension !== ".png") {
            result.failed.push({
                fileName: file.name,
                error: "Only JSON and PNG character cards can be imported.",
            });
            continue;
        }

        try {
            const candidate = await importCharacterFileFromUpload(file, extension);
            let imported = candidate.character;
            const fingerprint = imported.importedFrom?.fingerprint;

            if (fingerprint && importedFingerprints.has(fingerprint)) {
                result.skipped += 1;
                continue;
            }

            imported = await attachImportedAvatar(imported, candidate);
            await createCharacter(imported);
            if (fingerprint) {
                importedFingerprints.add(fingerprint);
            }
            result.imported += 1;
            result.activeCharacterId = imported.id;
        } catch (error) {
            result.failed.push({
                fileName: file.name,
                error:
                    error instanceof Error ? error.message : "Unexpected import error.",
            });
        }
    }

    if (result.imported > 0) {
        result.characters = await readCharacterSummaryCollection();
    }

    return result;
}

async function readImportedFingerprints() {
    const collection = await readCharacterCollection();
    return new Set(
        collection.characters
            .map((character) => character.importedFrom?.fingerprint)
            .filter((fingerprint): fingerprint is string => Boolean(fingerprint)),
    );
}

async function importCharacterFileFromDisk(
    sourcePath: string,
    sourceFileName: string,
    extension: string,
): Promise<CharacterImportCandidate> {
    if (extension === ".json") {
        const text = await Bun.file(sourcePath).text();
        const raw = parseCharacterJson(text);
        const fingerprint = fingerprintCharacterCard(raw);
        const character = importCharacterCard(raw, {
            format: "json",
            sourceFileName,
            fingerprint,
            characterId: await archivedImportCharacterId(fingerprint),
        });

        return {
            character,
            raw,
            ...embeddedAvatarFromCard(raw),
        };
    }

    const bytes = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());
    const raw = readPngCharacterJson(bytes);
    const fingerprint = fingerprintCharacterCard(raw);
    const character = importCharacterCard(raw, {
        format: "png",
        sourceFileName,
        fingerprint,
        characterId: await archivedImportCharacterId(fingerprint),
    });

    return {
        character,
        raw,
        avatarBytes: bytes,
        avatarType: "png",
    };
}

async function importCharacterFileFromUpload(
    file: File,
    extension: string,
): Promise<CharacterImportCandidate> {
    if (extension === ".json") {
        const raw = parseCharacterJson(await file.text());
        const fingerprint = fingerprintCharacterCard(raw);
        const character = importCharacterCard(raw, {
            format: "json",
            sourceFileName: file.name,
            fingerprint,
            characterId: await archivedImportCharacterId(fingerprint),
        });

        return {
            character,
            raw,
            ...embeddedAvatarFromCard(raw),
        };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageType = detectImageType(bytes);

    if (imageType !== "png") {
        throw new BadRequestError(
            "PNG character card file content is not a valid PNG image.",
        );
    }

    const raw = readPngCharacterJson(bytes);
    const fingerprint = fingerprintCharacterCard(raw);
    const character = importCharacterCard(raw, {
        format: "png",
        sourceFileName: file.name,
        fingerprint,
        characterId: await archivedImportCharacterId(fingerprint),
    });

    return {
        character,
        raw,
        avatarBytes: bytes,
        avatarType: "png",
    };
}

async function attachImportedAvatar(
    character: SmileyCharacter,
    candidate: CharacterImportCandidate,
): Promise<SmileyCharacter> {
    if (!candidate.avatarBytes || !candidate.avatarType) {
        return character;
    }

    const avatar = await writeAvatarAssetBytes(
        character,
        candidate.avatarBytes,
        candidate.avatarType,
    );

    return {
        ...character,
        avatar,
    };
}

function embeddedAvatarFromCard(
    raw: unknown,
): Pick<CharacterImportCandidate, "avatarBytes" | "avatarType"> {
    if (!isRecord(raw) || !isRecord(raw.data) || !Array.isArray(raw.data.assets)) {
        return {};
    }

    for (const asset of raw.data.assets) {
        if (!isRecord(asset)) {
            continue;
        }

        const type = typeof asset.type === "string" ? asset.type.toLowerCase() : "";
        const uri = typeof asset.uri === "string" ? asset.uri : "";

        if (!/(avatar|icon|image|portrait)/.test(type)) {
            continue;
        }

        const parsed = parseDataImageUri(uri);

        if (parsed) {
            return parsed;
        }
    }

    return {};
}

async function archivedImportCharacterId(fingerprint: string) {
    const characterId = await archivedCharacterIdForFingerprint(fingerprint);

    if (!characterId || (await readCharacterById(characterId))) {
        return "";
    }

    return characterId;
}

function parseDataImageUri(
    uri: string,
): Pick<CharacterImportCandidate, "avatarBytes" | "avatarType"> | undefined {
    const match = uri.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);

    if (!match) {
        return undefined;
    }

    const contentType = match[1].toLowerCase();
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    const avatarType = avatarTypeForContentType(contentType);

    if (!avatarType || detectImageType(bytes) !== avatarType) {
        return undefined;
    }

    return {
        avatarBytes: bytes,
        avatarType,
    };
}

function fingerprintCharacterCard(raw: unknown) {
    return `sha256-${createHash("sha256").update(stableStringify(raw)).digest("hex")}`;
}
