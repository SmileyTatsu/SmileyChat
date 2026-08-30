export interface MenuPosition {
    x: number;
    y: number;
}

export interface ViewportBounds {
    width?: number;
    height?: number;
    left?: number;
    top?: number;
}

/**
 * Clamps menu coordinates so the menu origin remains within the visible viewport bounds.
 *
 * Defaults to `window.visualViewport` (with fallback to `window.innerWidth` / `innerHeight`)
 * to account for mobile virtual keyboards and pinch-zoom offsets.
 *
 * When menu dimensions exceed the available viewport, the position is clamped to the minimum
 * padding edge (the menu element itself should use CSS `max-width`, `max-height`, and `overflow`
 * to prevent overflowing the viewport).
 *
 * @param x Target X coordinate (e.g. click clientX)
 * @param y Target Y coordinate (e.g. click clientY)
 * @param menuWidth Width of the menu in pixels
 * @param menuHeight Height of the menu in pixels
 * @param padding Minimum distance from viewport edges (defaults to 12px)
 * @param bounds Optional viewport boundaries (defaults to visualViewport or window dimensions)
 */
export function clampMenuPosition(
    x: number,
    y: number,
    menuWidth: number,
    menuHeight: number,
    padding = 12,
    bounds?: ViewportBounds,
): MenuPosition {
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const safeWidth = Number.isFinite(menuWidth) && menuWidth > 0 ? menuWidth : 0;
    const safeHeight = Number.isFinite(menuHeight) && menuHeight > 0 ? menuHeight : 0;
    const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : 12;

    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;

    const defaultLeft = vv && Number.isFinite(vv.offsetLeft) ? vv.offsetLeft : 0;
    const defaultTop = vv && Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0;
    const defaultWidth =
        vv && Number.isFinite(vv.width)
            ? Math.max(0, vv.width)
            : typeof window !== "undefined" && Number.isFinite(window.innerWidth)
              ? Math.max(0, window.innerWidth)
              : 0;
    const defaultHeight =
        vv && Number.isFinite(vv.height)
            ? Math.max(0, vv.height)
            : typeof window !== "undefined" && Number.isFinite(window.innerHeight)
              ? Math.max(0, window.innerHeight)
              : 0;

    const rawLeft = bounds?.left !== undefined ? bounds.left : defaultLeft;
    const rawTop = bounds?.top !== undefined ? bounds.top : defaultTop;
    const rawWidth = bounds?.width !== undefined ? bounds.width : defaultWidth;
    const rawHeight = bounds?.height !== undefined ? bounds.height : defaultHeight;

    const viewportLeft = Number.isFinite(rawLeft) ? (rawLeft as number) : defaultLeft;
    const viewportTop = Number.isFinite(rawTop) ? (rawTop as number) : defaultTop;
    const viewportWidth =
        Number.isFinite(rawWidth) && (rawWidth as number) >= 0
            ? (rawWidth as number)
            : defaultWidth;
    const viewportHeight =
        Number.isFinite(rawHeight) && (rawHeight as number) >= 0
            ? (rawHeight as number)
            : defaultHeight;

    let clampedX = safeX;
    if (viewportWidth > 0) {
        const minX = viewportLeft + safePadding;
        const maxX = Math.max(
            minX,
            viewportLeft + viewportWidth - safeWidth - safePadding,
        );
        clampedX = Math.min(Math.max(minX, safeX), maxX);
    } else {
        clampedX = Math.max(viewportLeft + safePadding, safeX);
    }

    let clampedY = safeY;
    if (viewportHeight > 0) {
        const minY = viewportTop + safePadding;
        const maxY = Math.max(
            minY,
            viewportTop + viewportHeight - safeHeight - safePadding,
        );
        clampedY = Math.min(Math.max(minY, safeY), maxY);
    } else {
        clampedY = Math.max(viewportTop + safePadding, safeY);
    }

    return {
        x: clampedX,
        y: clampedY,
    };
}
