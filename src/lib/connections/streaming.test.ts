import { describe, expect, test } from "bun:test";
import { readJsonServerSentEvents } from "./streaming";

describe("SSE cancellation", () => {
    test("aborts a pending read and releases its lock even when cancel rejects", async () => {
        const controller = new AbortController();
        const body = new ReadableStream<Uint8Array>({
            cancel() {
                return Promise.reject(new Error("Transport already closed"));
            },
        });
        const result = readJsonServerSentEvents(
            new Response(body),
            () => {},
            controller.signal,
        );
        controller.abort();
        await expect(result).rejects.toMatchObject({ name: "AbortError" });
        expect(body.locked).toBe(false);
    });

    test("lock release errors cannot replace AbortError", async () => {
        const controller = new AbortController();
        let finishRead!: (value: { done: boolean }) => void;
        const reader = {
            read: () =>
                new Promise<{ done: boolean }>((resolve) => {
                    finishRead = resolve;
                }),
            cancel: async () => {
                finishRead({ done: true });
            },
            releaseLock: () => {
                throw new TypeError("Read still pending");
            },
        };
        const response = { body: { getReader: () => reader } } as unknown as Response;
        const result = readJsonServerSentEvents(response, () => {}, controller.signal);
        controller.abort();
        await expect(result).rejects.toMatchObject({ name: "AbortError" });
    });

    test("keeps non-abort stream errors and releases the lock", async () => {
        const failure = new Error("Connection lost");
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.error(failure);
            },
        });
        await expect(readJsonServerSentEvents(new Response(body), () => {})).rejects.toBe(
            failure,
        );
        expect(body.locked).toBe(false);
    });
});
