import { isRecord } from "./guards";

export type ImageAvatar = {
    type: "png" | "jpeg" | "webp";
    path: string;
};

type Identifiable = {
    id: string;
};

type TimestampSource = {
    createdAt?: unknown;
    updatedAt?: unknown;
};

export function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}

export function asIsoString(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    return Number.isFinite(Date.parse(value)) ? value : "";
}

export function normalizeImageAvatar(value: unknown): ImageAvatar | undefined {
    if (
        !isRecord(value) ||
        (value.type !== "png" && value.type !== "jpeg" && value.type !== "webp")
    ) {
        return undefined;
    }

    const path = asString(value.path);
    return path ? { type: value.type, path } : undefined;
}

export function normalizeArray<T>(
    value: unknown,
    normalizeItem: (item: unknown) => T | undefined,
) {
    return Array.isArray(value)
        ? value
              .map(normalizeItem)
              .filter((item): item is T => Boolean(item))
        : [];
}

export function selectActiveId<TItem extends Identifiable>(
    items: TItem[],
    requestedActiveId: unknown,
    fallback = "",
) {
    const requested = asString(requestedActiveId);
    return items.some((item) => item.id === requested)
        ? requested
        : (items[0]?.id ?? fallback);
}

export function normalizeTimestamps(
    value: TimestampSource,
    now = new Date().toISOString(),
) {
    return {
        createdAt: asIsoString(value.createdAt) || now,
        updatedAt: asIsoString(value.updatedAt) || now,
    };
}

export function normalizeUpdatedAt(
    value: unknown,
    now = new Date().toISOString(),
    options: { requireIso?: boolean } = {},
) {
    return (options.requireIso === false ? asString(value) : asIsoString(value)) || now;
}
