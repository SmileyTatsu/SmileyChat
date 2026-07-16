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
