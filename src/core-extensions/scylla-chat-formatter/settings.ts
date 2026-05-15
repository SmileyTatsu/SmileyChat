export type FormatterSettings = {
    version: 1;
    enabled: boolean;
    markdown: boolean;
    xmlTags: boolean;
    links: boolean;
    images: boolean;
    codeBlocks: boolean;
    spoilers: boolean;
    preserveUnknownTags: boolean;
};

export const defaultFormatterSettings: FormatterSettings = {
    version: 1,
    enabled: true,
    markdown: true,
    xmlTags: true,
    links: true,
    images: true,
    codeBlocks: true,
    spoilers: true,
    preserveUnknownTags: true,
};

let activeSettings = { ...defaultFormatterSettings };

export function getFormatterSettings() {
    return activeSettings;
}

export function setFormatterSettings(settings: FormatterSettings) {
    activeSettings = settings;
}

export function normalizeFormatterSettings(value: unknown): FormatterSettings {
    return {
        ...defaultFormatterSettings,
        ...(value && typeof value === "object" ? value : {}),
        version: 1,
    };
}
