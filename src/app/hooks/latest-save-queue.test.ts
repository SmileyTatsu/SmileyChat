import { describe, expect, test } from "bun:test";

import { createLatestSaveQueue } from "./latest-save-queue";

describe("createLatestSaveQueue", () => {
    test("writes snapshots sequentially and keeps only the newest pending value", async () => {
        const writes: string[] = [];
        const firstWrite = deferred<void>();
        const secondWrite = deferred<void>();
        const thirdWriteStarted = deferred<void>();
        const queue = createLatestSaveQueue<string, void>({
            save: async (value) => {
                writes.push(value);
                if (value === "third") {
                    thirdWriteStarted.resolve();
                }
                await (value === "first" ? firstWrite.promise : secondWrite.promise);
            },
        });

        const first = queue.enqueue("first");
        const second = queue.enqueue("second");
        const third = queue.enqueue("third");

        expect(writes).toEqual(["first"]);
        expect(queue.getLatestPendingValue()).toBe("third");

        firstWrite.resolve();
        await thirdWriteStarted.promise;
        expect(writes).toEqual(["first", "third"]);

        secondWrite.resolve();
        await Promise.all([first, second, third]);
        expect(writes).toEqual(["first", "third"]);
        expect(queue.getLatestPendingValue()).toBeUndefined();
    });
});

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((nextResolve) => {
        resolve = nextResolve;
    });

    return { promise, resolve };
}
