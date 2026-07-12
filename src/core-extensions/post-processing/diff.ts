export type DiffPiece = {
    type: "equal" | "added" | "removed";
    text: string;
};

export type SideBySideDiffRow = {
    type: "equal" | "changed" | "added" | "removed";
    original: DiffPiece[];
    revised: DiffPiece[];
};

type LineOperation = {
    type: "equal" | "added" | "removed";
    text: string;
};

const MAX_LINE_PRODUCT = 4_000_000;
const MAX_TOKEN_PRODUCT = 4_000_000;

export function diffSideBySide(original: string, revised: string): SideBySideDiffRow[] {
    if (original === revised) {
        return original ? splitLines(original).map((line) => equalRow(line)) : [];
    }

    const originalLines = splitLines(original);
    const revisedLines = splitLines(revised);
    const operations =
        originalLines.length * revisedLines.length <= MAX_LINE_PRODUCT
            ? buildLineOperations(originalLines, revisedLines)
            : buildIndexedLineOperations(originalLines, revisedLines);

    return operationsToRows(operations);
}

function splitLines(text: string): string[] {
    if (!text) {
        return [];
    }

    return (
        text.match(/[^\r\n]*(?:\r\n|\n|\r)?/g)?.filter((line) => line.length > 0) ?? []
    );
}

function equalRow(text: string): SideBySideDiffRow {
    const piece = { type: "equal" as const, text };
    return {
        type: "equal",
        original: [piece],
        revised: [piece],
    };
}

function buildLineOperations(
    originalLines: string[],
    revisedLines: string[],
): LineOperation[] {
    const rows = originalLines.length + 1;
    const columns = revisedLines.length + 1;
    const table = Array.from({ length: rows }, () => new Uint32Array(columns));

    for (let row = originalLines.length - 1; row >= 0; row -= 1) {
        for (let column = revisedLines.length - 1; column >= 0; column -= 1) {
            if (originalLines[row] === revisedLines[column]) {
                table[row][column] = table[row + 1][column + 1] + 1;
            } else {
                table[row][column] = Math.max(
                    table[row + 1][column],
                    table[row][column + 1],
                );
            }
        }
    }

    const operations: LineOperation[] = [];
    let row = 0;
    let column = 0;

    while (row < originalLines.length && column < revisedLines.length) {
        if (originalLines[row] === revisedLines[column]) {
            operations.push({ type: "equal", text: originalLines[row] });
            row += 1;
            column += 1;
        } else if (table[row + 1][column] >= table[row][column + 1]) {
            operations.push({ type: "removed", text: originalLines[row] });
            row += 1;
        } else {
            operations.push({ type: "added", text: revisedLines[column] });
            column += 1;
        }
    }

    while (row < originalLines.length) {
        operations.push({ type: "removed", text: originalLines[row] });
        row += 1;
    }

    while (column < revisedLines.length) {
        operations.push({ type: "added", text: revisedLines[column] });
        column += 1;
    }

    return operations;
}

function buildIndexedLineOperations(
    originalLines: string[],
    revisedLines: string[],
): LineOperation[] {
    const operations: LineOperation[] = [];
    const lineCount = Math.max(originalLines.length, revisedLines.length);

    for (let index = 0; index < lineCount; index += 1) {
        const originalLine = originalLines[index];
        const revisedLine = revisedLines[index];

        if (originalLine === revisedLine && originalLine !== undefined) {
            operations.push({ type: "equal", text: originalLine });
        } else {
            if (originalLine !== undefined) {
                operations.push({ type: "removed", text: originalLine });
            }

            if (revisedLine !== undefined) {
                operations.push({ type: "added", text: revisedLine });
            }
        }
    }

    return operations;
}

function operationsToRows(operations: LineOperation[]): SideBySideDiffRow[] {
    const rows: SideBySideDiffRow[] = [];
    let removedLines: string[] = [];
    let addedLines: string[] = [];

    function flushChangedLines() {
        const lineCount = Math.max(removedLines.length, addedLines.length);

        for (let index = 0; index < lineCount; index += 1) {
            const removedLine = removedLines[index];
            const addedLine = addedLines[index];

            if (removedLine !== undefined && addedLine !== undefined) {
                rows.push(changedRow(removedLine, addedLine));
            } else if (removedLine !== undefined) {
                rows.push({
                    type: "removed",
                    original: [{ type: "removed", text: removedLine }],
                    revised: [],
                });
            } else if (addedLine !== undefined) {
                rows.push({
                    type: "added",
                    original: [],
                    revised: [{ type: "added", text: addedLine }],
                });
            }
        }

        removedLines = [];
        addedLines = [];
    }

    for (const operation of operations) {
        if (operation.type === "equal") {
            flushChangedLines();
            rows.push(equalRow(operation.text));
            continue;
        }

        if (operation.type === "removed") {
            removedLines.push(operation.text);
        } else {
            addedLines.push(operation.text);
        }
    }

    flushChangedLines();
    return rows;
}

function changedRow(originalLine: string, revisedLine: string): SideBySideDiffRow {
    const pieces = diffTokens(originalLine, revisedLine);

    return {
        type: "changed",
        original: pieces.filter((piece) => piece.type !== "added"),
        revised: pieces.filter((piece) => piece.type !== "removed"),
    };
}

function diffTokens(original: string, revised: string): DiffPiece[] {
    const originalTokens = tokenizeText(original);
    const revisedTokens = tokenizeText(revised);

    if (
        originalTokens.length === 0 ||
        revisedTokens.length === 0 ||
        originalTokens.length * revisedTokens.length > MAX_TOKEN_PRODUCT
    ) {
        return [
            { type: "removed", text: original },
            { type: "added", text: revised },
        ];
    }

    return mergePieces(buildTokenDiff(originalTokens, revisedTokens));
}

function tokenizeText(text: string): string[] {
    return text.match(/\s+|[^\s]+/g) ?? [];
}

function buildTokenDiff(originalTokens: string[], revisedTokens: string[]): DiffPiece[] {
    const rows = originalTokens.length + 1;
    const columns = revisedTokens.length + 1;
    const table = Array.from({ length: rows }, () => new Uint32Array(columns));

    for (let row = originalTokens.length - 1; row >= 0; row -= 1) {
        for (let column = revisedTokens.length - 1; column >= 0; column -= 1) {
            if (originalTokens[row] === revisedTokens[column]) {
                table[row][column] = table[row + 1][column + 1] + 1;
            } else {
                table[row][column] = Math.max(
                    table[row + 1][column],
                    table[row][column + 1],
                );
            }
        }
    }

    const pieces: DiffPiece[] = [];
    let row = 0;
    let column = 0;

    while (row < originalTokens.length && column < revisedTokens.length) {
        if (originalTokens[row] === revisedTokens[column]) {
            pieces.push({ type: "equal", text: originalTokens[row] });
            row += 1;
            column += 1;
        } else if (table[row + 1][column] >= table[row][column + 1]) {
            pieces.push({ type: "removed", text: originalTokens[row] });
            row += 1;
        } else {
            pieces.push({ type: "added", text: revisedTokens[column] });
            column += 1;
        }
    }

    while (row < originalTokens.length) {
        pieces.push({ type: "removed", text: originalTokens[row] });
        row += 1;
    }

    while (column < revisedTokens.length) {
        pieces.push({ type: "added", text: revisedTokens[column] });
        column += 1;
    }

    return pieces;
}

function mergePieces(pieces: DiffPiece[]): DiffPiece[] {
    const merged: DiffPiece[] = [];

    for (const piece of pieces) {
        if (!piece.text) {
            continue;
        }

        const previous = merged[merged.length - 1];
        if (previous?.type === piece.type) {
            previous.text += piece.text;
            continue;
        }

        merged.push({ ...piece });
    }

    return merged;
}
