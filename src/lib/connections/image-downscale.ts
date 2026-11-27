export const MAX_IMAGE_DIMENSION = 1568;
export const IMAGE_COMPRESSION_QUALITY = 0.85;

export type ImageDownscaleOptions = {
    /** Longest side in pixels. 0 sends the original pixels untouched. */
    maxDimension: number;
    /** JPEG quality for re-encoded images, 0..1. */
    quality: number;
};

export const defaultImageDownscaleOptions: ImageDownscaleOptions = {
    maxDimension: MAX_IMAGE_DIMENSION,
    quality: IMAGE_COMPRESSION_QUALITY,
};

let activeOptions: ImageDownscaleOptions = { ...defaultImageDownscaleOptions };

/**
 * Provider adapters only receive a blob, so the app pushes the user's
 * preference here once instead of threading options through every adapter.
 */
export function setImageDownscaleOptions(options: Partial<ImageDownscaleOptions>) {
    activeOptions = { ...activeOptions, ...options };
}

export function imageDownscaleOptions(): ImageDownscaleOptions {
    return activeOptions;
}

/**
 * Downscales an image Blob on the client-side before base64 encoding for provider calls.
 * Preserves the original file untouched on disk while dramatically reducing API request payload sizes.
 */
export async function downscaleImageBlob(
    blob: Blob,
    overrides?: Partial<ImageDownscaleOptions>,
): Promise<Blob> {
    const options = { ...activeOptions, ...overrides };
    const maxDimension = options.maxDimension;

    if (maxDimension <= 0) {
        return blob;
    }

    if (
        !blob.type.startsWith("image/") ||
        blob.type === "image/svg+xml" ||
        blob.type === "image/gif"
    ) {
        return blob;
    }

    // In non-DOM or test environments without canvas/imageBitmap support, return original blob safely.
    if (typeof createImageBitmap === "undefined" && typeof document === "undefined") {
        return blob;
    }

    try {
        if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob);
            const { width, height } = bitmap;

            if (
                width <= maxDimension &&
                height <= maxDimension &&
                blob.size < 1.5 * 1024 * 1024
            ) {
                bitmap.close?.();
                return blob;
            }

            let targetWidth = width;
            let targetHeight = height;

            if (targetWidth > maxDimension || targetHeight > maxDimension) {
                if (targetWidth >= targetHeight) {
                    targetHeight = Math.max(
                        1,
                        Math.round((targetHeight * maxDimension) / targetWidth),
                    );
                    targetWidth = maxDimension;
                } else {
                    targetWidth = Math.max(
                        1,
                        Math.round((targetWidth * maxDimension) / targetHeight),
                    );
                    targetHeight = maxDimension;
                }
            }

            let canvas: OffscreenCanvas | HTMLCanvasElement;
            if (typeof OffscreenCanvas !== "undefined") {
                canvas = new OffscreenCanvas(targetWidth, targetHeight);
            } else if (typeof document !== "undefined") {
                canvas = document.createElement("canvas");
                canvas.width = targetWidth;
                canvas.height = targetHeight;
            } else {
                bitmap.close?.();
                return blob;
            }

            const ctx = canvas.getContext("2d") as
                | CanvasRenderingContext2D
                | OffscreenCanvasRenderingContext2D
                | null;
            if (!ctx) {
                bitmap.close?.();
                return blob;
            }

            ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
            bitmap.close?.();

            const targetMime = blob.type === "image/png" ? "image/png" : "image/jpeg";
            const quality = targetMime === "image/jpeg" ? options.quality : undefined;

            let downscaledBlob: Blob | null = null;
            if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
                downscaledBlob = await canvas.convertToBlob({
                    type: targetMime,
                    quality,
                });
            } else if ("toBlob" in canvas && typeof canvas.toBlob === "function") {
                downscaledBlob = await new Promise<Blob | null>((resolve) => {
                    (canvas as HTMLCanvasElement).toBlob(
                        (res) => resolve(res),
                        targetMime,
                        quality,
                    );
                });
            }

            if (
                downscaledBlob &&
                (downscaledBlob.size < blob.size ||
                    width > maxDimension ||
                    height > maxDimension)
            ) {
                return downscaledBlob;
            }
        }
    } catch {
        // If decoding/canvas fails, fall back gracefully to the original blob.
        return blob;
    }

    return blob;
}
