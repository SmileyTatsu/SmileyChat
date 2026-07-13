import { describe, expect, test } from "bun:test";

import { regexReplacerManifest } from "./manifest";

describe("Regex Replacer manifest", () => {
    test("declares the state access required by its display middleware", () => {
        expect(regexReplacerManifest.permissions).toContain("state:read");
    });
});
