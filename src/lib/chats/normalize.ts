import { isRecord } from "#frontend/lib/common/guards";
import { createId } from "#frontend/lib/common/ids";
import { clampInteger, clampNumber } from "#frontend/lib/common/math";
import { getMessageCreatedAt } from "#frontend/lib/messages";

import type {
    ChatAttachment,
    ChatMode,
    Message,
    MessageMetadata,
    MessageToolCall,
    MessageToolResult,
    MessageSwipe,
    MessageToolActivity,
} from "#frontend/types";

import type {
    ChatGroup,
    ChatGroupMember,
    ChatKind,
    ChatMetadata,
    ChatSession,
    ChatSummary,
    ChatSummaryCollection,
} from "./types";

export function normalizeChat(value: unknown): ChatSession | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const now = new Date().toISOString();
    const id = asString(value.id) || createId("chat");
    const kind = normalizeChatKind(value.kind);
    const members = normalizeGroupMembers(value.members);
    const characterId = asString(value.characterId) || members[0]?.characterId || "";

    if (!characterId) {
        return undefined;
    }

    const isGroup = kind === "group" && members.length > 0;
    const group = isGroup ? normalizeGroup(value.group) : undefined;
    const defaultTitle =
        asString(value.defaultTitle).trim() ||
        (isGroup ? defaultGroupTitle(members) : "New chat");
    const title = asString(value.title).trim();
    const messages = Array.isArray(value.messages)
        ? value.messages
              .map(normalizeMessage)
              .filter((message): message is Message => Boolean(message))
        : [];

    return {
        id,
        version: 1,
        ...(isGroup ? { kind: "group" as const, members, group } : {}),
        characterId,
        defaultTitle,
        ...(title ? { title } : {}),
        mode: normalizeMode(value.mode),
        ...(normalizeMetadata(value.metadata)
            ? { metadata: normalizeMetadata(value.metadata) }
            : {}),
        messages,
        createdAt: asIsoString(value.createdAt) || now,
        updatedAt: asIsoString(value.updatedAt) || now,
    };
}

export function normalizeChatSummary(value: unknown): ChatSummary | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id);
    const kind = normalizeChatKind(value.kind);
    const members = normalizeGroupMembers(value.members);
    const characterId = asString(value.characterId) || members[0]?.characterId || "";
    const isGroup = kind === "group" && members.length > 0;
    const group = isGroup ? normalizeGroup(value.group) : undefined;
    const defaultTitle =
        asString(value.defaultTitle).trim() ||
        (isGroup ? defaultGroupTitle(members) : "New chat");
    const title = asString(value.title).trim();

    if (!id || !characterId) {
        return undefined;
    }

    return {
        id,
        ...(isGroup ? { kind: "group" as const, members, group } : {}),
        characterId,
        defaultTitle,
        ...(title ? { title } : {}),
        mode: normalizeMode(value.mode),
        ...(normalizeMetadata(value.metadata)
            ? { metadata: normalizeMetadata(value.metadata) }
            : {}),
        messageCount: asNonNegativeInteger(value.messageCount),
        ...(asIsoString(value.lastMessageAt)
            ? { lastMessageAt: asIsoString(value.lastMessageAt) }
            : {}),
        createdAt: asIsoString(value.createdAt) || new Date().toISOString(),
        updatedAt: asIsoString(value.updatedAt) || new Date().toISOString(),
    };
}

export function normalizeChatSummaryCollection(value: unknown): ChatSummaryCollection {
    if (!isRecord(value)) {
        return {
            version: 1,
            activeChatIdsByCharacter: {},
            chats: [],
        };
    }

    const chats = Array.isArray(value.chats)
        ? value.chats
              .map(normalizeChatSummary)
              .filter((chat): chat is ChatSummary => Boolean(chat))
        : [];
    const chatIds = new Set(
        chats.filter((chat) => !isGroupChat(chat)).map((chat) => chat.id),
    );
    const activeChatIdsByCharacter = normalizeActiveChatIds(
        value.activeChatIdsByCharacter,
        chatIds,
    );

    for (const chat of chats.filter((chat) => !isGroupChat(chat))) {
        if (!activeChatIdsByCharacter[chat.characterId]) {
            activeChatIdsByCharacter[chat.characterId] = chat.id;
        }
    }

    return {
        version: 1,
        activeChatIdsByCharacter,
        chats,
    };
}

export function chatToSummary(chat: ChatSession): ChatSummary {
    return {
        id: chat.id,
        ...(isGroupChat(chat)
            ? { kind: "group" as const, members: chat.members, group: chat.group }
            : {}),
        characterId: chat.characterId,
        defaultTitle: chat.defaultTitle,
        ...(chat.title ? { title: chat.title } : {}),
        mode: chat.mode,
        ...(chat.metadata ? { metadata: chat.metadata } : {}),
        messageCount: chat.messages.length,
        ...(chatLastMessageAt(chat) ? { lastMessageAt: chatLastMessageAt(chat) } : {}),
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
    };
}

export function chatDisplayTitle(
    chat: Pick<ChatSession | ChatSummary, "defaultTitle" | "title">,
) {
    return chat.title?.trim() || chat.defaultTitle;
}

export function isGroupChat(chat: Pick<ChatSession | ChatSummary, "kind" | "members">) {
    return chat.kind === "group" && Boolean(chat.members?.length);
}

export function getSmileyGroupMetadata(
    chat: Pick<ChatSession | ChatSummary, "metadata">,
) {
    const value = chat.metadata?.smileychatGroup;
    return value &&
        typeof value.groupId === "string" &&
        (value.role === "workspace" || value.role === "conversation")
        ? value
        : undefined;
}

export function isGroupWorkspace(
    chat: Pick<ChatSession | ChatSummary, "kind" | "members" | "metadata">,
) {
    if (!isGroupChat(chat)) return false;

    // Metadata-free groups predate workspaces. Their existing chat remains the
    // single conversation and also acts as its rail workspace until upgraded.
    const metadata = getSmileyGroupMetadata(chat);
    return !metadata || metadata.role === "workspace";
}

export function groupWorkspaceId(
    chat: Pick<ChatSession | ChatSummary, "id" | "kind" | "members" | "metadata">,
) {
    const metadata = getSmileyGroupMetadata(chat);
    return metadata?.groupId || (isGroupChat(chat) ? chat.id : "");
}

export function defaultGroupTitle(members: ChatGroupMember[]) {
    const names = members
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((member) => member.name.trim() || "Character");

    return `Group: ${names.join(", ")}`;
}

export function chatLastMessageAt(chat: Pick<ChatSession, "messages">) {
    const lastMessage = chat.messages[chat.messages.length - 1];
    return lastMessage ? getMessageCreatedAt(lastMessage) : "";
}

function normalizeMessage(value: unknown): Message | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id) || createId("message");
    const role =
        value.role === "user" || value.role === "character" ? value.role : undefined;
    const author = asString(value.author);
    const authorCharacterId = asString(value.authorCharacterId);
    const authorAvatarPath = asString(value.authorAvatarPath);
    const authorPersonaId = asString(value.authorPersonaId);
    const metadata = normalizeMessageMetadata(value.metadata);
    const toolCalls = normalizeToolCalls(value.toolCalls);
    const toolResult = normalizeToolResult(value.toolResult);

    if (!role || !author) {
        return undefined;
    }

    const createdAt = asIsoString(value.createdAt) || new Date().toISOString();
    const swipes = Array.isArray(value.swipes)
        ? value.swipes
              .map(normalizeSwipe)
              .filter((swipe): swipe is MessageSwipe => Boolean(swipe))
        : [];
    const safeSwipes = swipes.length
        ? swipes
        : [
              {
                  id: createId("swipe"),
                  content: "",
                  createdAt,
              },
          ];
    const activeSwipeIndex = clampInteger(
        value.activeSwipeIndex,
        0,
        safeSwipes.length - 1,
    );

    return {
        id,
        author,
        ...(authorCharacterId ? { authorCharacterId } : {}),
        ...(authorAvatarPath ? { authorAvatarPath } : {}),
        ...(authorPersonaId ? { authorPersonaId } : {}),
        ...(metadata ? { metadata } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        ...(toolResult ? { toolResult } : {}),
        role,
        createdAt,
        activeSwipeIndex,
        swipes: safeSwipes,
    };
}

function normalizeMessageMetadata(value: unknown): MessageMetadata | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const origin = value.origin === "plugin" ? "plugin" : undefined;
    const pluginId = asString(value.pluginId);
    const displayRole = value.displayRole === "system" ? "system" : undefined;
    const promptRole =
        value.promptRole === "assistant" ||
        value.promptRole === "user" ||
        value.promptRole === "system" ||
        value.promptRole === "none"
            ? value.promptRole
            : undefined;
    const metadata: MessageMetadata = {
        ...(origin ? { origin } : {}),
        ...(pluginId ? { pluginId } : {}),
        ...(displayRole ? { displayRole } : {}),
        ...(typeof value.includeInPrompt === "boolean"
            ? { includeInPrompt: value.includeInPrompt }
            : {}),
        ...(promptRole ? { promptRole } : {}),
        ...(typeof value.canGenerateSwipe === "boolean"
            ? { canGenerateSwipe: value.canGenerateSwipe }
            : {}),
        ...(value.toolProtocol === "assistant_tool_call"
            ? { toolProtocol: "assistant_tool_call" as const }
            : {}),
        ...(normalizeToolActivity(value.toolActivity)
            ? { toolActivity: normalizeToolActivity(value.toolActivity) }
            : {}),
    };

    return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeToolCalls(value: unknown): MessageToolCall[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!isRecord(item)) {
                return undefined;
            }

            const id = asString(item.id);
            const name = asString(item.name).trim();
            const argumentsText = asString(item.argumentsText);
            const args = isRecord(item.arguments) ? item.arguments : undefined;

            if (!id || !name) {
                return undefined;
            }

            return {
                id,
                name,
                argumentsText: argumentsText || "{}",
                ...(args ? { arguments: args } : {}),
                ...("providerState" in item ? { providerState: item.providerState } : {}),
            };
        })
        .filter((item): item is MessageToolCall => Boolean(item));
}

function normalizeToolResult(value: unknown): MessageToolResult | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const toolCallId = asString(value.toolCallId);
    const name = asString(value.name).trim();

    if (!toolCallId || !name) {
        return undefined;
    }

    return {
        toolCallId,
        name,
        content: asString(value.content),
        ...(typeof value.isError === "boolean" ? { isError: value.isError } : {}),
    };
}

function normalizeMessageToolActivities(value: unknown): MessageToolActivity[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!isRecord(item)) return undefined;
            const call = normalizeToolCalls([item.call])[0];
            const result = normalizeToolResult(item.result);

            if (!call || !result) return undefined;

            return {
                call,
                result,
                ...(item.status === "running" ? { status: "running" as const } : {}),
            };
        })
        .filter((item): item is MessageToolActivity => Boolean(item));
}

function normalizeToolActivity(value: unknown): MessageMetadata["toolActivity"] {
    if (!isRecord(value)) {
        return undefined;
    }

    const name = asString(value.name).trim();
    const status =
        value.status === "running" ||
        value.status === "complete" ||
        value.status === "error"
            ? value.status
            : undefined;

    if (!name || !status) {
        return undefined;
    }

    return {
        name,
        status,
        ...(asString(value.argumentsText)
            ? { argumentsText: asString(value.argumentsText) }
            : {}),
        ...(asString(value.result) ? { result: asString(value.result) } : {}),
    };
}

function normalizeSwipe(value: unknown): MessageSwipe | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    return {
        id: asString(value.id) || createId("swipe"),
        content: asString(value.content),
        ...(Array.isArray(value.attachments)
            ? {
                  attachments: value.attachments
                      .map(normalizeAttachment)
                      .filter((attachment): attachment is ChatAttachment =>
                          Boolean(attachment),
                      ),
              }
            : {}),
        createdAt: asIsoString(value.createdAt) || new Date().toISOString(),
        ...(asString(value.reasoning) ? { reasoning: asString(value.reasoning) } : {}),
        ...("reasoningDetails" in value
            ? { reasoningDetails: value.reasoningDetails }
            : {}),
        ...(value.status === "error" ? { status: "error" as const } : {}),
        ...(Array.isArray(value.toolActivities) &&
        normalizeMessageToolActivities(value.toolActivities).length
            ? { toolActivities: normalizeMessageToolActivities(value.toolActivities) }
            : {}),
        ...(normalizeSwipeTimeline(value.timeline).length
            ? { timeline: normalizeSwipeTimeline(value.timeline) }
            : {}),
        ...(normalizePendingToolContinuation(value.pendingToolContinuation)
            ? {
                  pendingToolContinuation: normalizePendingToolContinuation(
                      value.pendingToolContinuation,
                  ),
              }
            : {}),
    };
}

function normalizeSwipeTimeline(value: unknown): NonNullable<MessageSwipe["timeline"]> {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!isRecord(item)) return undefined;
            const id = asString(item.id) || createId("timeline");

            if (item.type === "thought") {
                const content = asString(item.content);
                if (!content) return undefined;
                return {
                    id,
                    type: "thought" as const,
                    content,
                    ...("details" in item ? { details: item.details } : {}),
                };
            }

            if (item.type === "tool") {
                const activity = normalizeMessageToolActivities(
                    item.activity ? [item.activity] : [],
                )[0];
                if (!activity) return undefined;
                return {
                    id,
                    type: "tool" as const,
                    activity,
                };
            }

            return undefined;
        })
        .filter((item): item is NonNullable<MessageSwipe["timeline"]>[number] =>
            Boolean(item),
        );
}

function normalizePendingToolContinuation(
    value: unknown,
): MessageSwipe["pendingToolContinuation"] {
    if (!isRecord(value)) return undefined;

    const profileId = asString(value.profileId).trim();
    const toolCalls = normalizeToolCalls(value.toolCalls);
    if (!profileId || toolCalls.length === 0) return undefined;

    return {
        profileId,
        ...(isRecord(value.generation) ? { generation: value.generation } : {}),
        toolCalls,
    };
}

function normalizeAttachment(value: unknown): ChatAttachment | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id) || createId("attachment");
    const url = asString(value.url);

    const type = value.type === "image" || value.type === "file" ? value.type : undefined;

    if (!type || !url) {
        return undefined;
    }

    const name = asString(value.name);
    const mimeType = asString(value.mimeType);
    const sizeBytes =
        typeof value.sizeBytes === "number" &&
        Number.isInteger(value.sizeBytes) &&
        value.sizeBytes >= 0
            ? value.sizeBytes
            : undefined;

    return {
        id,
        type,
        url,
        ...(mimeType ? { mimeType } : {}),
        ...(name ? { name } : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    };
}

function normalizeMode(value: unknown): ChatMode {
    return value === "rp" ? "rp" : "chat";
}

function normalizeChatKind(value: unknown): ChatKind {
    return value === "group" ? "group" : "direct";
}

function normalizeGroupMembers(value: unknown): ChatGroupMember[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<string>();
    const members: ChatGroupMember[] = [];

    for (let index = 0; index < value.length; index += 1) {
        const item = value[index];

        if (!isRecord(item)) {
            continue;
        }

        const characterId = asString(item.characterId);
        if (!characterId || seen.has(characterId)) {
            continue;
        }

        seen.add(characterId);
        const name = asString(item.name).trim() || "Character";
        const avatarPath = asString(item.avatarPath);
        const talkativeness =
            typeof item.talkativeness === "number" && Number.isFinite(item.talkativeness)
                ? Math.min(1, Math.max(0, item.talkativeness))
                : undefined;

        members.push({
            characterId,
            name,
            ...(avatarPath ? { avatarPath } : {}),
            ...(typeof item.muted === "boolean" ? { muted: item.muted } : {}),
            order: asNonNegativeInteger(item.order) || index,
            ...(talkativeness !== undefined ? { talkativeness } : {}),
        });
    }

    return members.sort((left, right) => left.order - right.order);
}

function normalizeGroup(value: unknown): ChatGroup {
    const record = isRecord(value) ? value : {};
    const title = asString(record.title).trim();
    const avatar = normalizeGroupAvatar(record.avatar);
    const joinPrefix = asString(record.joinPrefix);
    const scenarioOverride = asString(record.scenarioOverride).trim();

    return {
        ...(title ? { title } : {}),
        ...(avatar ? { avatar } : { avatar: { type: "collage" as const } }),
        autoResponses: normalizeAutoResponses(record.autoResponses),
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
        joinPrefix,
        ...(scenarioOverride ? { scenarioOverride } : {}),
    };
}

function normalizeAutoResponses(value: unknown): NonNullable<ChatGroup["autoResponses"]> {
    const record = isRecord(value) ? value : {};

    return {
        enabled: record.enabled === true,
        chance: clampNumber(record.chance, 0, 1, 0.35),
        delayMs: Math.round(clampNumber(record.delayMs, 0, 10000, 900)),
        maxTurns: Math.round(clampNumber(record.maxTurns, 1, 8, 2)),
    };
}

function normalizeGroupAvatar(value: unknown): ChatGroup["avatar"] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const type = value.type === "custom" ? "custom" : "collage";
    const path = asString(value.path);

    return {
        type,
        ...(path ? { path } : {}),
    };
}

function normalizeActiveChatIds(value: unknown, chatIds: Set<string>) {
    if (!isRecord(value)) {
        return {};
    }

    const output: Record<string, string> = {};

    for (const [characterId, chatId] of Object.entries(value)) {
        if (typeof chatId === "string" && chatIds.has(chatId)) {
            output[characterId] = chatId;
        }
    }

    return output;
}

function normalizeMetadata(value: unknown): ChatMetadata | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const enabledToolGroups = uniqueStrings(value.enabledToolGroups);
    const legacyMcpServerIds = isRecord(value.mcp)
        ? uniqueStrings(value.mcp.serverIds)
        : [];
    const nextEnabledToolGroups = Array.from(
        new Set([
            ...enabledToolGroups,
            ...legacyMcpServerIds.map((serverId) => `smiley-mcp:${serverId}`),
        ]),
    );
    const { mcp: _legacyMcp, enabledToolGroups: _groups, ...metadata } = value;
    return {
        ...metadata,
        ...(nextEnabledToolGroups.length
            ? { enabledToolGroups: nextEnabledToolGroups }
            : {}),
    };
}

function uniqueStrings(value: unknown) {
    return Array.from(
        new Set(
            Array.isArray(value)
                ? value
                      .filter(
                          (item): item is string =>
                              typeof item === "string" && Boolean(item.trim()),
                      )
                      .map((item) => item.trim())
                : [],
        ),
    );
}

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function asIsoString(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    return Number.isFinite(Date.parse(value)) ? value : "";
}

function asNonNegativeInteger(value: unknown) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
