import { personaToSummary } from "#frontend/lib/personas/defaults";

import { BadRequestError, NotFoundError, writeJsonAtomic } from "./http";
import { personaFilePath } from "./persona-file-paths";
import {
    deletePersonaAvatarAsset,
    personaAvatarTypeForContentType,
    writePersonaAvatarAssetBytes,
} from "./persona-images";
import { readPersonaById, readPersonaSummaryCollection } from "./persona-store";

export async function writePersonaAvatar(personaId: string, request: Request) {
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
    const avatarType = personaAvatarTypeForContentType(contentType);

    if (!avatarType) {
        throw new BadRequestError("Avatar must be a PNG, JPEG, or WebP image.");
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    const persona = await readPersonaById(personaId);

    if (!persona) {
        throw new NotFoundError("Persona not found.");
    }

    const avatar = await writePersonaAvatarAssetBytes(personaId, bytes, avatarType);
    const updatedPersona = {
        ...persona,
        avatar,
        updatedAt: new Date().toISOString(),
    };

    await writeJsonAtomic(personaFilePath(personaId), updatedPersona);
    await deletePersonaAvatarAsset(persona);

    return {
        avatar,
        persona: updatedPersona,
        summary: personaToSummary(updatedPersona),
        personas: await readPersonaSummaryCollection(),
    };
}
