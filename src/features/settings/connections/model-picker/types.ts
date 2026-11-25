/**
 * Contract shared by the ModelPicker component, the provider panels that use it
 * and the connection-settings wiring. Types only: change it deliberately.
 */

export type ModelPickerItem = {
    /** Exact model id sent to the provider. Unique inside one picker. */
    id: string;
    /** Primary text. Falls back to the id when equal; searched together with the id. */
    label: string;
    /** Chip / grouping key: catalog category label, or the id prefix (`anthropic/…`). */
    group: string;
    /** Short right-aligned detail, e.g. `128k · $3/M`. Optional. */
    meta?: string;
};

export type ModelPickerProps = {
    items: ModelPickerItem[];
    /** Selected model id, "" when nothing is selected. */
    value: string;
    /** Max rows rendered at once. Search always runs over ALL items; this only caps the DOM. */
    limit: number;
    favorites: string[];
    recent: string[];
    disabled?: boolean;
    /** Shown in the closed trigger when `value` is empty. */
    placeholder?: string;
    /** Shown inside the open list when `items` is empty (e.g. "Press Load to fetch models"). */
    emptyHint?: string;
    /** Called for a listed model and for a typed custom id ("Use «text» as the model id"). */
    onSelect: (id: string) => void;
    onToggleFavorite: (id: string) => void;
};

/**
 * What a provider panel receives from ConnectionsSettings so its picker can persist
 * favorites and recents on the active connection profile.
 */
export type ModelPickerContext = {
    limit: number;
    favorites: string[];
    recent: string[];
    onToggleFavorite: (id: string) => void;
    /** Call once when the user picks a model, so it enters the recent list. */
    onModelUsed: (id: string) => void;
};
