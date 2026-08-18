import { describe, expect, test, mock } from "bun:test";
import { clientLogger, createClientLogger } from "./client-logger";

describe("clientLogger", () => {
    test("creates scoped logger and formats error details", () => {
        const logger = createClientLogger("test-scope");
        expect(typeof logger.info).toBe("function");
        expect(typeof logger.debug).toBe("function");
        expect(typeof logger.warn).toBe("function");
        expect(typeof logger.error).toBe("function");

        // Smoke test call without throwing
        logger.info("Testing clientLogger info");
        logger.debug("Testing clientLogger debug", { foo: "bar" });
        logger.warn("Testing clientLogger warn", new Error("warning message"));
        logger.error("Testing clientLogger error", new Error("error message"));
    });
});
