export type ChatThemeId = "chat" | "rp" | "bubbles" | (string & {});

export type ChatThemePreviewSample = {
    author: string;
    text: string;
    quote?: string;
    time?: string;
};

export type ChatThemeDefinition = {
    id: string;
    name: string;
    badge: string;
    description: string;
    preview: ChatThemePreviewSample;
};
