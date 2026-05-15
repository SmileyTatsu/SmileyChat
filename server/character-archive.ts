import type { SmileyCharacter } from "#frontend/lib/characters/types";
import { isRecord } from "#frontend/lib/common/guards";

import { writeJsonAtomic } from "./http";
import { characterArchivePath } from "./paths";

type CharacterArchive = {
    version: 1;
    identities: Record<string, { characterId: string; name: string; archivedAt: string }>;
};

export async function archiveCharacterIdentity(character: SmileyCharacter) {
    const fingerprint = character.importedFrom?.fingerprint;

    if (!fingerprint) {
        return;
    }

    const archive = await readCharacterArchive();
    archive.identities[fingerprint] = {
        characterId: character.id,
        name: character.data.name,
        archivedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(characterArchivePath, archive);
}

export async function archivedCharacterIdForFingerprint(fingerprint: string) {
    const archive = await readCharacterArchive();
    return archive.identities[fingerprint]?.characterId ?? "";
}

async function readCharacterArchive(): Promise<CharacterArchive> {
    if (!(await Bun.file(characterArchivePath).exists())) {
        return emptyArchive();
    }

    try {
        return normalizeCharacterArchive(await Bun.file(characterArchivePath).json());
    } catch {
        return emptyArchive();
    }
}

function normalizeCharacterArchive(value: unknown): CharacterArchive {
    if (!isRecord(value) || !isRecord(value.identities)) {
        return emptyArchive();
    }

    const identities: CharacterArchive["identities"] = {};

    for (const [fingerprint, identity] of Object.entries(value.identities)) {
        if (!isRecord(identity)) {
            continue;
        }

        const characterId =
            typeof identity.characterId === "string" ? identity.characterId : "";

        if (!characterId) {
            continue;
        }

        identities[fingerprint] = {
            characterId,
            name: typeof identity.name === "string" ? identity.name : "",
            archivedAt:
                typeof identity.archivedAt === "string"
                    ? identity.archivedAt
                    : new Date().toISOString(),
        };
    }

    return {
        version: 1,
        identities,
    };
}

function emptyArchive(): CharacterArchive {
    return {
        version: 1,
        identities: {},
    };
}
