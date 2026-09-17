const locks = new Map<string, Promise<void>>();

// Serializes each resource's complete read-modify-write transaction. Atomic file
// replacement alone prevents torn files, but not stale reads from concurrent APIs.
export async function withResourceLock<T>(key: string, work: () => Promise<T>) {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    const chained = previous.catch(() => undefined).then(() => current);
    locks.set(key, chained);

    await previous.catch(() => undefined);
    try {
        return await work();
    } finally {
        release();
        if (locks.get(key) === chained) {
            locks.delete(key);
        }
    }
}

// Acquires multiple resource locks in deterministic sorted order to prevent deadlocks.
export async function withResourceLocks<T>(
    keys: string[],
    work: () => Promise<T>,
): Promise<T> {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean))).sort();

    const acquire = async (index: number): Promise<T> => {
        if (index >= uniqueKeys.length) {
            return work();
        }
        return withResourceLock(uniqueKeys[index], () => acquire(index + 1));
    };

    return acquire(0);
}
