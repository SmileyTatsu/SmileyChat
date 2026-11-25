/**
 * Pure helpers for per-profile model usage lists. They keep model IDs unique
 * and bounded so `connections.json` stays small no matter how much the picker
 * is used.
 */

const maxFavoriteModels = 200;

/** Adds a model to the end of the favorites, or removes it when already there. */
export function toggleFavoriteModel(
    list: readonly string[] | undefined,
    id: string,
): string[] {
    const current = list ? [...list] : [];
    const modelId = id.trim();

    if (!modelId) return current;

    const index = current.indexOf(modelId);

    if (index >= 0) {
        current.splice(index, 1);
        return current;
    }

    current.push(modelId);

    // Favorites are appended in order, so the oldest entries sit at the front.
    return current.length > maxFavoriteModels
        ? current.slice(current.length - maxFavoriteModels)
        : current;
}

/** Moves a model to the front of the recent list and caps the list length. */
export function pushRecentModel(
    list: readonly string[] | undefined,
    id: string,
    max = 6,
): string[] {
    const current = list ? [...list] : [];
    const modelId = id.trim();

    if (!modelId) return current;

    const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
    const next = [modelId, ...current.filter((entry) => entry !== modelId)];

    return next.length > limit ? next.slice(0, limit) : next;
}
