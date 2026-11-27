export type TrashCandidate = {
    path: string;
    mtime: number;
    isFile: boolean;
};

export type TrashRetention = {
    /** How many entries may stay recoverable. */
    keepCount: number;
    /** How long an entry may stay recoverable. */
    maxAgeMs: number;
};

/**
 * Which trash entries should be removed. Newest-first order is assumed, so the
 * first `keepCount` entries that are also younger than `maxAgeMs` survive and
 * everything else goes — the folder can never grow past the user's retention.
 */
export function selectTrashPurgeCandidates(
    candidates: TrashCandidate[],
    { keepCount, maxAgeMs }: TrashRetention,
    now = Date.now(),
) {
    return candidates
        .filter(
            (candidate, index) => index >= keepCount || now - candidate.mtime >= maxAgeMs,
        )
        .map((candidate) => candidate.path);
}
