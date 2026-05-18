import { chatDisplayTitle, isGroupChat } from "#frontend/lib/chats/normalize";
import type { ChatGroup, ChatGroupMember } from "#frontend/lib/chats/types";

import { safeFileStem } from "./character-file-paths";
import { createChat, readChatById } from "./chat-store";
import { BadRequestError } from "./http";

type GroupExport = {
    spec: "smileychat_group";
    spec_version: "1.0";
    exportedAt: string;
    data: {
        title?: string;
        defaultTitle: string;
        characterId: string;
        members: ChatGroupMember[];
        group: ChatGroup;
    };
};

export async function exportGroupChatDefinition(chatId: string) {
    const chat = await readChatById(chatId);

    if (!chat) {
        return new Response("Chat not found.", { status: 404 });
    }

    if (!isGroupChat(chat)) {
        return new Response("Only group chats can be exported as groups.", {
            status: 400,
        });
    }

    const group = portableGroupSettings(chat.group);
    const definition: GroupExport = {
        spec: "smileychat_group",
        spec_version: "1.0",
        exportedAt: new Date().toISOString(),
        data: {
            ...(chat.title ? { title: chat.title } : {}),
            defaultTitle: chat.defaultTitle,
            characterId: chat.characterId,
            members: chat.members ?? [],
            group,
        },
    };
    const fileStem = safeFileStem(chatDisplayTitle(chat) || chat.id);

    return new Response(`${JSON.stringify(definition, null, 2)}\n`, {
        headers: {
            "Content-Disposition": `attachment; filename="${fileStem}.group.json"`,
            "Content-Type": "application/json; charset=utf-8",
        },
    });
}

export async function importGroupChatDefinition(value: unknown) {
    const data = normalizeGroupImportData(value);
    const result = await createChat({
        version: 1,
        kind: "group",
        characterId: data.characterId,
        members: data.members,
        group: data.group,
        defaultTitle: data.defaultTitle,
        ...(data.title ? { title: data.title } : {}),
        mode: "rp",
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });

    return result;
}

function normalizeGroupImportData(value: unknown): GroupExport["data"] {
    const record = isRecord(value) ? value : {};
    const data = isRecord(record.data) ? record.data : record;
    const members = Array.isArray(data.members) ? data.members.filter(isGroupMember) : [];

    if (members.length === 0) {
        throw new BadRequestError("Group import needs at least one member.");
    }

    const characterId = asString(data.characterId) || members[0]?.characterId || "";

    if (!characterId) {
        throw new BadRequestError("Group import is missing a character id.");
    }

    return {
        title: asString(data.title).trim() || undefined,
        defaultTitle: asString(data.defaultTitle).trim() || "Imported group",
        characterId,
        members,
        group: portableGroupSettings(data.group),
    };
}

function portableGroupSettings(value: unknown): ChatGroup {
    const record = isRecord(value) ? value : {};
    const avatar =
        isRecord(record.avatar) && record.avatar.type === "custom"
            ? { type: "collage" as const }
            : record.avatar;

    return {
        ...(record.title && typeof record.title === "string"
            ? { title: record.title.trim() }
            : {}),
        avatar:
            isRecord(avatar) && avatar.type === "custom"
                ? { type: "custom", path: asString(avatar.path) }
                : { type: "collage" },
        autoResponses: isRecord(record.autoResponses)
            ? {
                  enabled: record.autoResponses.enabled === true,
                  chance: numberInRange(record.autoResponses.chance, 0, 1, 0.35),
                  delayMs: Math.round(
                      numberInRange(record.autoResponses.delayMs, 0, 10000, 900),
                  ),
                  maxTurns: Math.round(
                      numberInRange(record.autoResponses.maxTurns, 1, 8, 2),
                  ),
              }
            : {
                  enabled: false,
                  chance: 0.35,
                  delayMs: 900,
                  maxTurns: 2,
              },
        replyOrder:
            record.replyOrder === "natural" || record.replyOrder === "pooled"
                ? record.replyOrder
                : "list",
        generationMode:
            record.generationMode === "join-character-cards"
                ? "join-character-cards"
                : "swap-character-cards",
        ...(typeof record.allowSelfResponses === "boolean"
            ? { allowSelfResponses: record.allowSelfResponses }
            : {}),
        greetingMode:
            record.greetingMode === "first" || record.greetingMode === "none"
                ? record.greetingMode
                : "all",
        joinPrefix: asString(record.joinPrefix),
        ...(asString(record.scenarioOverride).trim()
            ? { scenarioOverride: asString(record.scenarioOverride).trim() }
            : {}),
    };
}

function isGroupMember(value: unknown): value is ChatGroupMember {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.characterId === "string" && typeof value.name === "string";
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}
