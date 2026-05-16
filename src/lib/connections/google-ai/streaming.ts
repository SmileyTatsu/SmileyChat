import { readJsonServerSentEvents } from "../streaming";

import {
    extractGoogleAIImages,
    extractGoogleAIText,
    extractGoogleAIThoughtText,
} from "./mappers";
import type { GoogleAIGenerateContentStreamChunk } from "./types";

export async function readGoogleAIStream(
    response: Response,
    onChunk: (
        tokens: {
            images: string[];
            message: string;
            reasoning: string;
        },
        chunk: GoogleAIGenerateContentStreamChunk,
    ) => void,
    signal?: AbortSignal,
) {
    await readJsonServerSentEvents<GoogleAIGenerateContentStreamChunk>(
        response,
        (chunk) => emitGoogleAITokens(chunk, onChunk),
        signal,
    );
}

function emitGoogleAITokens(
    chunk: GoogleAIGenerateContentStreamChunk,
    onChunk: (
        tokens: {
            images: string[];
            message: string;
            reasoning: string;
        },
        chunk: GoogleAIGenerateContentStreamChunk,
    ) => void,
) {
    const images = extractGoogleAIImages(chunk);
    const message = extractGoogleAIText(chunk);
    const reasoning = extractGoogleAIThoughtText(chunk);

    if (message || reasoning || images.length) {
        onChunk({ images, message, reasoning }, chunk);
    }
}
