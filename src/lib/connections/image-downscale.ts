export const MAX_IMAGE_DIMENSION = 1568;
export const IMAGE_COMPRESSION_QUALITY = 0.85;

/**
 * Downscales an image Blob on the client-side before base64 encoding for provider calls.
 * Preserves the original file untouched on disk while dramatically reducing API request payload sizes.
 */
export async function downscaleImageBlob(
    blob: Blob,
    maxDimension = MAX_IMAGE_DIMENSION,
): Promise<Blob> {
    if (!blob.type.startsWith("image/") || blob.type === "image/svg+xml" || blob.type === "image/gif") {
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

            if (width <= maxDimension && height <= maxDimension && blob.size < 1.5 * 1024 * 1024) {
                bitmap.close?.();
                return blob;
            }

            let targetWidth = width;
            let targetHeight = height;

            if (targetWidth > maxDimension || targetHeight > maxDimension) {
                if (targetWidth >= targetHeight) {
                    targetHeight = Math.max(1, Math.round((targetHeight * maxDimension) / targetWidth));
                    targetWidth = maxDimension;
                } else {
                    targetWidth = Math.max(1, Math.round((targetWidth * maxDimension) / targetHeight));
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
            const quality = targetMime === "image/jpeg" ? IMAGE_COMPRESSION_QUALITY : undefined;

            let downscaledBlob: Blob | null = null;
            if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
                downscaledBlob = await canvas.convertToBlob({ type: targetMime, quality });
            } else if ("toBlob" in canvas && typeof canvas.toBlob === "function") {
                downscaledBlob = await new Promise<Blob | null>((resolve) => {
                    (canvas as HTMLCanvasElement).toBlob(
                        (res) => resolve(res),
                        targetMime,
                        quality,
                    );
                });
            }

            if (downscaledBlob && (downscaledBlob.size < blob.size || width > maxDimension || height > maxDimension)) {
                return downscaledBlob;
            }
        }
    } catch {
        // If decoding/canvas fails, fall back gracefully to the original blob.
        return blob;
    }

    return blob;
}
