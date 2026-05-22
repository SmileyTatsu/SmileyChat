import { useRef, useState } from "preact/hooks";

export type ActiveGeneration = {
    controller: AbortController;
    streamingMessageId?: string;
    swipeMessageId?: string;
};

export function useChatGenerationState() {
    const [pendingChatIds, setPendingChatIds] = useState<string[]>([]);
    const [pendingSwipeMessageIds, setPendingSwipeMessageIds] = useState<
        Record<string, string>
    >({});
    const pendingChatIdsRef = useRef<string[]>([]);
    const pendingSwipeMessageIdsRef = useRef<Record<string, string>>({});
    const activeGenerationsRef = useRef<Record<string, ActiveGeneration>>({});

    pendingChatIdsRef.current = pendingChatIds;
    pendingSwipeMessageIdsRef.current = pendingSwipeMessageIds;

    function isChatPending(chatId: string) {
        return (
            pendingChatIdsRef.current.includes(chatId) ||
            Boolean(pendingSwipeMessageIdsRef.current[chatId])
        );
    }

    function beginChatPending(chatId: string, swipeMessageId = "") {
        setPendingChatIds((current) => {
            const next = current.includes(chatId) ? current : [...current, chatId];
            pendingChatIdsRef.current = next;
            return next;
        });

        if (swipeMessageId) {
            setPendingSwipeMessageIds((current) => {
                const next = {
                    ...current,
                    [chatId]: swipeMessageId,
                };
                pendingSwipeMessageIdsRef.current = next;
                return next;
            });
        }
    }

    function endChatPending(chatId: string) {
        setPendingChatIds((current) => {
            const next = current.filter((id) => id !== chatId);
            pendingChatIdsRef.current = next;
            return next;
        });
        setPendingSwipeMessageIds((current) => {
            if (!current[chatId]) {
                return current;
            }

            const next = { ...current };
            delete next[chatId];
            pendingSwipeMessageIdsRef.current = next;
            return next;
        });
    }

    function beginGenerationController(
        chatId: string,
        target: Omit<ActiveGeneration, "controller"> = {},
    ) {
        const controller = new AbortController();
        activeGenerationsRef.current = {
            ...activeGenerationsRef.current,
            [chatId]: {
                controller,
                ...target,
            },
        };
        return controller;
    }

    function endGenerationController(chatId: string, controller: AbortController) {
        if (activeGenerationsRef.current[chatId]?.controller !== controller) {
            return;
        }

        const next = { ...activeGenerationsRef.current };
        delete next[chatId];
        activeGenerationsRef.current = next;
    }

    function getActiveGeneration(chatId: string) {
        return activeGenerationsRef.current[chatId];
    }

    return {
        beginChatPending,
        beginGenerationController,
        endChatPending,
        endGenerationController,
        getActiveGeneration,
        isChatPending,
        pendingChatIds,
        pendingSwipeMessageIds,
    };
}
