export type UploadedJsonFile<T = unknown> = {
    data: T;
    fileName: string;
};

export async function readUploadedJsonFiles<T = unknown>(
    files: Iterable<File>,
    options: { maxBytes?: number } = {},
): Promise<UploadedJsonFile<T>[]> {
    const maxBytes = options.maxBytes ?? 2_000_000;
    const output: UploadedJsonFile<T>[] = [];

    for (const file of files) {
        if (file.size > maxBytes) {
            throw new Error(`${file.name} is larger than ${maxBytes} bytes.`);
        }

        output.push({
            data: JSON.parse(await file.text()) as T,
            fileName: file.name,
        });
    }

    return output;
}

export function downloadJson(fileName: string, value: unknown) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

export function safeExportFileName(
    value: string,
    extension: string,
    fallback = "export",
) {
    const safeBase =
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || fallback;
    const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;

    return `${safeBase}${safeExtension}`;
}

export function normalizeImportedObject<T>(
    value: unknown,
    normalize: (value: unknown) => T | undefined,
    label = "Imported JSON",
) {
    const normalized = normalize(value);

    if (!normalized) {
        throw new Error(`${label} is not a supported shape.`);
    }

    return normalized;
}
