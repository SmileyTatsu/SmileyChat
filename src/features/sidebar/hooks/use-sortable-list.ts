import { useEffect, useRef } from "preact/hooks";

type SortableListOptions = {
    disabled?: boolean;
    onReorder: (oldIndex: number, newIndex: number) => void;
    /** Interactive descendants that must keep their normal pointer behavior. */
    ignoreSelector?: string;
};

const DESKTOP_DRAG_DELAY_MS = 200;
const TOUCH_DRAG_DELAY_MS = 250;
const DRAG_THRESHOLD_PX = 5;
const TOUCH_DRIFT_TOLERANCE_PX = 20;

/**
 * Pointer-native vertical sorting. A normal click is left untouched; a hold or
 * small drag promotes the item to a sortable drag and suppresses its drop click.
 */
export function useSortableList({
    disabled = false,
    onReorder,
    ignoreSelector = "input, button, select, textarea, label, a, [data-sortable-ignore]",
}: SortableListOptions) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onReorderRef = useRef(onReorder);

    useEffect(() => {
        onReorderRef.current = onReorder;
    }, [onReorder]);

    useEffect(() => {
        if (disabled) return;
        const container = containerRef.current;
        if (!container) return;

        let activeIndex = -1;
        let targetIndex = -1;
        let pointerId = -1;
        let pointerType = "";
        let startY = 0;
        let dragging = false;
        let didScroll = false;
        let holdTimer: number | undefined;
        let items: HTMLElement[] = [];
        let rects: DOMRect[] = [];
        let suppressClick = false;
        let suppressContextMenu = false;
        let scrollHost: HTMLElement | undefined;
        let lastPointerY = 0;
        let lastTouchScrollY = 0;
        let autoScrollFrame: number | undefined;
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        const clearTimer = () => {
            if (holdTimer !== undefined) window.clearTimeout(holdTimer);
            holdTimer = undefined;
        };

        const findScrollHost = (element: HTMLElement) => {
            let parent = element.parentElement;
            while (parent) {
                const overflowY = window.getComputedStyle(parent).overflowY;
                if (
                    parent.scrollHeight > parent.clientHeight &&
                    (overflowY === "auto" ||
                        overflowY === "scroll" ||
                        overflowY === "overlay")
                ) {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return undefined;
        };

        const autoScroll = () => {
            if (!dragging || !scrollHost) {
                autoScrollFrame = undefined;
                return;
            }
            const rect = scrollHost.getBoundingClientRect();
            const edge = 48;
            const topDistance = lastPointerY - rect.top;
            const bottomDistance = rect.bottom - lastPointerY;
            const direction = topDistance < edge ? -1 : bottomDistance < edge ? 1 : 0;
            if (direction) {
                const distance = direction < 0 ? topDistance : bottomDistance;
                const speed = Math.max(2, Math.ceil(((edge - distance) / edge) * 12));
                const previousTop = scrollHost.scrollTop;
                scrollHost.scrollTop += direction * speed;
                if (scrollHost.scrollTop !== previousTop) {
                    autoScrollFrame = window.requestAnimationFrame(autoScroll);
                    return;
                }
            }
            autoScrollFrame = undefined;
        };

        const scheduleAutoScroll = (pointerY: number) => {
            lastPointerY = pointerY;
            if (autoScrollFrame === undefined) {
                autoScrollFrame = window.requestAnimationFrame(autoScroll);
            }
        };

        const reset = () => {
            clearTimer();
            if (autoScrollFrame !== undefined) cancelAnimationFrame(autoScrollFrame);
            autoScrollFrame = undefined;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            items.forEach((item) => {
                item.classList.remove("dragging");
                item.style.transform = "";
                item.style.transition = "";
                item.style.zIndex = "";
                item.style.position = "";
            });
            activeIndex = -1;
            targetIndex = -1;
            pointerId = -1;
            pointerType = "";
            scrollHost = undefined;
            lastTouchScrollY = 0;
            dragging = false;
            didScroll = false;
            items = [];
            rects = [];
        };

        const activate = () => {
            if (activeIndex < 0 || dragging) return;
            dragging = true;
            clearTimer();
            const item = items[activeIndex];
            if (!item) return;
            item.setPointerCapture(pointerId);
            item.classList.add("dragging");
            if (pointerType === "touch") navigator.vibrate?.(15);
            document.body.style.cursor = "grabbing";
            document.body.style.userSelect = "none";
        };

        const onPointerMove = (event: PointerEvent) => {
            if (event.pointerId !== pointerId || activeIndex < 0) return;
            const delta = Math.abs(event.clientY - startY);
            if (!dragging) {
                // A moving touch pointer is a scroll gesture until a stationary
                // long-press explicitly promotes it to a drag.
                if (pointerType === "touch") {
                    if (delta > TOUCH_DRIFT_TOLERANCE_PX) clearTimer();
                    if (delta > DRAG_THRESHOLD_PX) didScroll = true;
                    // touch-action: none keeps the pointer stream available for
                    // a long-press drag. Until that hold activates, reproduce
                    // the roster's regular vertical scrolling ourselves.
                    if (scrollHost) {
                        scrollHost.scrollTop -= event.clientY - lastTouchScrollY;
                    }
                    lastTouchScrollY = event.clientY;
                    return;
                }
                if (delta > DRAG_THRESHOLD_PX) activate();
            }
            if (!dragging) return;

            event.preventDefault();
            scheduleAutoScroll(event.clientY);
            let deltaY = event.clientY - startY;
            const draggedRect = rects[activeIndex];
            if (!draggedRect) return;
            deltaY = Math.max(
                rects[0].top - draggedRect.top,
                Math.min(deltaY, rects[rects.length - 1].bottom - draggedRect.bottom),
            );

            const center = draggedRect.top + draggedRect.height / 2 + deltaY;
            targetIndex = rects.reduce(
                (nearest, rect, index) =>
                    Math.abs(center - (rect.top + rect.height / 2)) <
                    Math.abs(center - (rects[nearest].top + rects[nearest].height / 2))
                        ? index
                        : nearest,
                0,
            );

            items.forEach((item, index) => {
                if (index === activeIndex) {
                    item.style.transform = `translateY(${deltaY}px) scale(var(--sortable-drag-scale, 1.04))`;
                    item.style.zIndex = "10";
                    item.style.position = "relative";
                    item.style.transition = "none";
                } else if (
                    activeIndex < targetIndex &&
                    index > activeIndex &&
                    index <= targetIndex
                ) {
                    item.style.transform = `translateY(${rects[index - 1].top - rects[index].top}px)`;
                } else if (
                    activeIndex > targetIndex &&
                    index >= targetIndex &&
                    index < activeIndex
                ) {
                    item.style.transform = `translateY(${rects[index + 1].top - rects[index].top}px)`;
                } else {
                    item.style.transform = "translateY(0)";
                }
                if (index !== activeIndex) {
                    item.style.transition = reducedMotion
                        ? "none"
                        : "transform 180ms cubic-bezier(.2,0,0,1)";
                }
            });
        };

        const finish = (event: PointerEvent) => {
            if (event.pointerId !== pointerId) return;
            const oldIndex = activeIndex;
            const newIndex = targetIndex;
            const didDrag = dragging;
            const didScrollGesture = didScroll;
            if (didDrag && items[oldIndex]?.hasPointerCapture(pointerId)) {
                items[oldIndex].releasePointerCapture(pointerId);
            }
            reset();
            if (didDrag || didScrollGesture) {
                suppressClick = true;
                window.setTimeout(() => (suppressClick = false), 0);
            }
            if (didDrag) {
                suppressContextMenu = true;
                window.setTimeout(() => (suppressContextMenu = false), 600);
                if (oldIndex !== newIndex) onReorderRef.current(oldIndex, newIndex);
            }
        };

        const onPointerDown = (event: PointerEvent) => {
            if (event.button !== 0 || !event.isPrimary) return;
            const target = event.target as HTMLElement;
            if (target.closest(ignoreSelector)) return;
            const item = target.closest("[data-sortable-index]") as HTMLElement | null;
            if (!item || !container.contains(item)) return;
            activeIndex = Number.parseInt(item.dataset.sortableIndex ?? "-1", 10);
            if (activeIndex < 0) return;
            targetIndex = activeIndex;
            pointerId = event.pointerId;
            pointerType = event.pointerType;
            startY = event.clientY;
            lastTouchScrollY = event.clientY;
            items = Array.from(
                container.querySelectorAll<HTMLElement>("[data-sortable-index]"),
            );
            rects = items.map((element) => element.getBoundingClientRect());
            scrollHost = findScrollHost(item);
            holdTimer = window.setTimeout(
                activate,
                pointerType === "touch" ? TOUCH_DRAG_DELAY_MS : DESKTOP_DRAG_DELAY_MS,
            );
        };

        const onClickCapture = (event: MouseEvent) => {
            if (!suppressClick) return;
            event.preventDefault();
            event.stopPropagation();
            suppressClick = false;
        };

        // Images and links can start the browser's HTML drag operation before a
        // pointer movement reaches our threshold. Sorting owns that gesture.
        const onNativeDragStart = (event: DragEvent) => event.preventDefault();
        const onContextMenuCapture = (event: MouseEvent) => {
            if (dragging || suppressContextMenu) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        container.addEventListener("pointerdown", onPointerDown);
        container.addEventListener("click", onClickCapture, true);
        container.addEventListener("dragstart", onNativeDragStart);
        container.addEventListener("contextmenu", onContextMenuCapture, true);
        window.addEventListener("pointermove", onPointerMove, { passive: false });
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);

        return () => {
            container.removeEventListener("pointerdown", onPointerDown);
            container.removeEventListener("click", onClickCapture, true);
            container.removeEventListener("dragstart", onNativeDragStart);
            container.removeEventListener("contextmenu", onContextMenuCapture, true);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            reset();
        };
    }, [disabled, ignoreSelector]);

    return { containerRef };
}
