import { useEffect, useRef, useState } from "preact/hooks";

import {
    exportCharacterCard,
    importChatFile as importChatFileRequest,
    importCharacterFiles as importCharacterFilesRequest,
} from "#frontend/lib/api/client";
import { normalizeCharacterSummaryCollection } from "#frontend/lib/characters/normalize";
import {
    normalizeChat,
    normalizeChatSummaryCollection,
} from "#frontend/lib/chats/normalize";
import { messageFromError } from "#frontend/lib/common/errors";
import type {
    CharacterSummaryCollection,
    ChatSession,
    ChatSummaryCollection,
} from "#frontend/types";

type UseImportExportOptions = {
    activeCharacterId: string;
    canImportChatForActiveCharacter: () => boolean;
    flushPendingCharacterAutosave: () => Promise<void>;
    flushPendingChatAutosave: () => Promise<void>;
    onCharacterImportFallback: () => Promise<void>;
    onCharactersImported: (
        summaries: CharacterSummaryCollection,
        activeCharacterId?: string,
    ) => Promise<void> | void;
    onChatImported: (
        chat: ChatSession,
        summaries?: ChatSummaryCollection,
    ) => Promise<void> | void;
    onChatSummariesImported: (summaries: ChatSummaryCollection) => void;
    onCharacterError: (message: string) => void;
    onChatError: (message: string) => void;
};

export function useImportExport({
    activeCharacterId,
    canImportChatForActiveCharacter,
    flushPendingCharacterAutosave,
    flushPendingChatAutosave,
    onCharacterImportFallback,
    onCharactersImported,
    onChatImported,
    onChatSummariesImported,
    onCharacterError,
    onChatError,
}: UseImportExportOptions) {
    const [characterImportStatus, setCharacterImportStatus] = useState("");
    const [chatImportStatus, setChatImportStatus] = useState("");
    const [chatImportStatusFading, setChatImportStatusFading] = useState(false);
    const chatImportStatusTimerRef = useRef<number | undefined>(undefined);
    const chatImportStatusFadeTimerRef = useRef<number | undefined>(undefined);

    useEffect(
        () => () => {
            if (chatImportStatusTimerRef.current) {
                window.clearTimeout(chatImportStatusTimerRef.current);
            }
            if (chatImportStatusFadeTimerRef.current) {
                window.clearTimeout(chatImportStatusFadeTimerRef.current);
            }
        },
        [],
    );

    function setChatImportStatusMessage(
        message: string,
        options: { autoDismiss?: boolean } = {},
    ) {
        const { autoDismiss = true } = options;

        if (chatImportStatusTimerRef.current) {
            window.clearTimeout(chatImportStatusTimerRef.current);
            chatImportStatusTimerRef.current = undefined;
        }
        if (chatImportStatusFadeTimerRef.current) {
            window.clearTimeout(chatImportStatusFadeTimerRef.current);
            chatImportStatusFadeTimerRef.current = undefined;
        }

        setChatImportStatus(message);
        setChatImportStatusFading(false);

        if (autoDismiss && message) {
            chatImportStatusTimerRef.current = window.setTimeout(() => {
                chatImportStatusTimerRef.current = undefined;
                beginChatImportStatusFade();
            }, 3000);
        }
    }

    function beginChatImportStatusFade() {
        if (chatImportStatusFadeTimerRef.current) {
            return;
        }
        if (chatImportStatusTimerRef.current) {
            window.clearTimeout(chatImportStatusTimerRef.current);
            chatImportStatusTimerRef.current = undefined;
        }

        setChatImportStatusFading(true);
        chatImportStatusFadeTimerRef.current = window.setTimeout(() => {
            setChatImportStatus("");
            setChatImportStatusFading(false);
            chatImportStatusFadeTimerRef.current = undefined;
        }, 350);
    }

    async function importCharacterFiles(files: File[]) {
        await flushPendingCharacterAutosave();
        await flushPendingChatAutosave();

        const formData = new FormData();

        for (const file of files) {
            formData.append("files", file, file.name);
        }

        try {
            const result = await importCharacterFilesRequest(formData);

            if (result.characters) {
                const summaries = normalizeCharacterSummaryCollection(result.characters);
                await onCharactersImported(
                    summaries,
                    result.activeCharacterId ?? summaries.activeCharacterId,
                );
            } else if ((result.imported ?? 0) > 0) {
                await onCharacterImportFallback();
            }
            setCharacterImportStatus(formatImportStatus(result));
            onCharacterError("");
        } catch (error) {
            onCharacterError(messageFromError(error));
        }
    }

    async function importChatFile(file: File) {
        if (!activeCharacterId || !canImportChatForActiveCharacter()) {
            setChatImportStatusMessage("Select a character before importing a chat.");
            return;
        }

        await flushPendingChatAutosave();

        const formData = new FormData();
        formData.append("characterId", activeCharacterId);
        formData.append("file", file, file.name);

        setChatImportStatusMessage(`Importing ${file.name}...`, { autoDismiss: false });

        try {
            const result = (await importChatFileRequest(formData)) as {
                chat: ChatSession;
                chats?: ChatSummaryCollection;
            };
            const importedChat = normalizeChat(result.chat);

            if (!importedChat) {
                throw new Error("Imported chat could not be normalized.");
            }

            if (result.chats) {
                onChatSummariesImported(normalizeChatSummaryCollection(result.chats));
            }

            await onChatImported(importedChat, result.chats);
            onChatError("");
            setChatImportStatusMessage(
                `Imported ${importedChat.messages.length} message${
                    importedChat.messages.length === 1 ? "" : "s"
                } from ${file.name}.`,
            );
        } catch (error) {
            const message = messageFromError(error);
            setChatImportStatusMessage(`Import failed: ${message}`);
            onChatError(message);
        }
    }

    async function exportCharacter(characterId: string, format: "json" | "png") {
        try {
            const response = await exportCharacterCard(characterId, format);
            const blob = await response.blob();
            const disposition = response.headers.get("Content-Disposition") ?? "";
            const filename =
                disposition.match(/filename="([^"]+)"/)?.[1] ?? `character.${format}`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            onCharacterError("");
        } catch (error) {
            onCharacterError(messageFromError(error));
        }
    }

    return {
        beginChatImportStatusFade,
        characterImportStatus,
        chatImportStatus,
        chatImportStatusFading,
        exportCharacter,
        importCharacterFiles,
        importChatFile,
        setChatImportStatusMessage,
    };
}

function formatImportStatus(result: {
    imported?: number;
    skipped?: number;
    failed?: Array<{ fileName: string; error: string }>;
}) {
    const imported = result.imported ?? 0;
    const skipped = result.skipped ?? 0;
    const failed = result.failed ?? [];
    const parts = [
        `${imported} imported`,
        skipped ? `${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : "",
        failed.length ? `${failed.length} failed` : "",
    ].filter(Boolean);
    const firstFailure = failed[0] ? ` ${failed[0].fileName}: ${failed[0].error}` : "";

    return `Import finished: ${parts.join(", ")}.${firstFailure}`;
}
