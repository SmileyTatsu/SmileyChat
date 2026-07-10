export type LatestSaveQueue<T> = {
    enqueue: (value: T) => Promise<void>;
    flush: () => Promise<void>;
    getLatestPendingValue: () => T | undefined;
};

type LatestSaveQueueOptions<T, Result> = {
    onError?: (error: unknown) => void;
    onSaved?: (value: T, result: Result) => void;
    save: (value: T) => Promise<Result>;
};

// Serializes writes while keeping only the newest snapshot queued behind the
// active request. Every enqueue resolves once the queue has drained, so callers
// that switch chats can wait for the latest durable state instead of one write.
export function createLatestSaveQueue<T, Result>(
    options: LatestSaveQueueOptions<T, Result>,
): LatestSaveQueue<T> {
    let drainPromise: Promise<void> | undefined;
    let latestPendingValue: T | undefined;
    let pendingValue: T | undefined;

    function enqueue(value: T) {
        latestPendingValue = value;
        pendingValue = value;

        if (!drainPromise) {
            drainPromise = drain().finally(() => {
                drainPromise = undefined;
            });
        }

        return drainPromise;
    }

    async function drain() {
        while (pendingValue !== undefined) {
            const value = pendingValue;
            pendingValue = undefined;

            try {
                const result = await options.save(value);

                if (pendingValue === undefined) {
                    latestPendingValue = undefined;
                    options.onSaved?.(value, result);
                }
            } catch (error) {
                if (pendingValue === undefined) {
                    options.onError?.(error);
                }
            }
        }
    }

    return {
        enqueue,
        flush: () => drainPromise ?? Promise.resolve(),
        getLatestPendingValue: () => latestPendingValue,
    };
}
