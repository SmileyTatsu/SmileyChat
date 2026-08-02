export type PendingChatLoad = {
    requestId: number;
    chatId?: string;
};

export function setChatLoadTarget(
    pending: PendingChatLoad | undefined,
    requestId: number,
    chatId: string,
) {
    if (!pending || pending.requestId !== requestId) {
        return pending;
    }

    return { ...pending, chatId };
}

export function completeChatLoad(
    pending: PendingChatLoad | undefined,
    requestId: number,
    chatId: string,
) {
    return pending?.requestId === requestId && pending.chatId === chatId
        ? undefined
        : pending;
}

export function cancelChatLoad(pending: PendingChatLoad | undefined, requestId: number) {
    return pending?.requestId === requestId ? undefined : pending;
}
