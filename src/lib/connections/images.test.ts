import { describe, expect, test } from "bun:test";

import { messageContentToText } from "./images";

describe("messageContentToText", () => {
    test("renders file placeholders without exposing base64 content", () => {
        expect(
            messageContentToText([
                { type: "text", text: "Read this" },
                {
                    type: "file",
                    file: {
                        filename: "notes.txt",
                        file_data: "data:text/plain;base64,SGVsbG8=",
                    },
                },
            ]),
        ).toBe("Read this\n[file: notes.txt]");
    });
});
