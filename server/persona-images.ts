import { rm } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative } from "node:path";

import type { SmileyPersona } from "#frontend/lib/personas/types";

import {
    avatarTypeForContentType,
    detectImageType,
    type AvatarType,
} from "./character-images";
import { BadRequestError } from "./http";
import { maxAvatarBytes, personaAssetsDir } from "./paths";
import { safeFileStem } from "./persona-file-paths";

export async function servePersonaAsset(url: URL) {
    const fileName = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const requestedPath = personaAssetPath(fileName);

    if (!requestedPath) {
        return new Response("Not found", { status: 404 });
    }

    const file = Bun.file(requestedPath);

    if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
    }

    return new Response(file);
}

export async function writePersonaAvatarAssetBytes(
    personaId: string,
    bytes: Uint8Array,
    avatarType: AvatarType,
) {
    if (bytes.byteLength === 0) {
        throw new BadRequestError("Avatar image is empty.");
    }

    if (bytes.byteLength > maxAvatarBytes) {
        throw new BadRequestError("Avatar image is too large. Use an image under 20 MB.");
    }

    const detectedType = detectImageType(bytes);
    if (detectedType !== avatarType) {
        throw new BadRequestError(
            `Avatar file content does not match its image type. Expected ${avatarType}, got ${detectedType || "unknown"}.`,
        );
    }

    const extension = avatarType === "jpeg" ? "jpg" : avatarType;
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 12);
    const fileName = await uniquePersonaAvatarFileName(
        `${safeFileStem(personaId)}-${Date.now()}-${hash}.${extension}`,
    );

    await Bun.write(join(personaAssetsDir, fileName), bytes);

    return {
        type: avatarType,
        path: `/api/personas/assets/${fileName}`,
    };
}

export async function deletePersonaAvatarAsset(persona: SmileyPersona) {
    const avatarPath = persona.avatar?.path;

    if (!avatarPath?.startsWith("/api/personas/assets/")) {
        return;
    }

    const fileName = decodeURIComponent(avatarPath.split("/").pop() ?? "");
    const requestedPath = personaAssetPath(fileName);

    if (!requestedPath) {
        return;
    }

    await rm(requestedPath, { force: true });
}

export function personaAvatarTypeForContentType(contentType: string) {
    return avatarTypeForContentType(contentType);
}

function personaAssetPath(fileName: string) {
    if (!/^[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp)$/.test(fileName)) {
        return "";
    }

    const requestedPath = normalize(join(personaAssetsDir, fileName));
    const safeAssetsDir = normalize(personaAssetsDir);
    const relativePath = relative(safeAssetsDir, requestedPath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        return "";
    }

    return requestedPath;
}

async function uniquePersonaAvatarFileName(fileName: string) {
    let candidate = fileName;
    const extension = extname(fileName);
    const baseName = fileName.slice(0, fileName.length - extension.length);
    let counter = 1;

    while (await Bun.file(join(personaAssetsDir, candidate)).exists()) {
        candidate = `${baseName}-${counter}${extension}`;
        counter += 1;
    }

    return candidate;
}
