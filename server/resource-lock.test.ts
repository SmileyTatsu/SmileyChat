import { describe, expect, test } from "bun:test";
import { withResourceLock, withResourceLocks } from "./resource-lock";

describe("resource locks", () => {
    test("serializes access to the same key", async () => {
        const events: string[] = [];

        const task1 = withResourceLock("res-1", async () => {
            events.push("start-1");
            await new Promise((resolve) => setTimeout(resolve, 20));
            events.push("end-1");
        });

        const task2 = withResourceLock("res-1", async () => {
            events.push("start-2");
            events.push("end-2");
        });

        await Promise.all([task1, task2]);

        expect(events).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    });

    test("withResourceLocks acquires multiple keys in sorted order without deadlocking", async () => {
        const events: string[] = [];

        // Two tasks requesting keys in opposite orders
        const task1 = withResourceLocks(["b", "a"], async () => {
            events.push("task1");
            await new Promise((resolve) => setTimeout(resolve, 20));
        });

        const task2 = withResourceLocks(["a", "b"], async () => {
            events.push("task2");
        });

        await Promise.all([task1, task2]);

        expect(events.length).toBe(2);
    });

    test("handles empty and single-element key arrays", async () => {
        let calledEmpty = false;
        await withResourceLocks([], async () => {
            calledEmpty = true;
        });
        expect(calledEmpty).toBe(true);

        let calledSingle = false;
        await withResourceLocks(["single"], async () => {
            calledSingle = true;
        });
        expect(calledSingle).toBe(true);
    });
});
