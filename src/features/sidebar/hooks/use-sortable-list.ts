import { useEffect, useRef } from "preact/hooks";

export function useSortableList({
    disabled,
    onReorder,
}: {
    disabled: boolean;
    onReorder: (oldIndex: number, newIndex: number) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onReorderRef = useRef(onReorder);

    useEffect(() => {
        onReorderRef.current = onReorder;
    }, [onReorder]);

    useEffect(() => {
        if (disabled) return;
        const container = containerRef.current;
        if (!container) return;

        let activeDragIndex = -1;
        let startY = 0;
        let itemElements: HTMLElement[] = [];
        let initialRects: DOMRect[] = [];
        let currentNewIndex = -1;
        let releaseCleanupFrame: number | undefined;

        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;

            const target = e.target as HTMLElement;
            const item = target.closest("[data-sortable-index]") as HTMLElement;
            if (!item) return;

            e.preventDefault();

            activeDragIndex = parseInt(
                item.getAttribute("data-sortable-index") || "-1",
                10,
            );
            if (activeDragIndex === -1) return;

            startY = e.clientY;
            currentNewIndex = activeDragIndex;

            itemElements = Array.from(
                container.querySelectorAll("[data-sortable-index]"),
            );
            initialRects = itemElements.map((el) => el.getBoundingClientRect());

            document.body.style.cursor = "grabbing";
            item.classList.add("dragging");
            item.setPointerCapture(e.pointerId);

            window.addEventListener("pointermove", onPointerMove, { passive: false });
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);
        };

        const onPointerMove = (e: PointerEvent) => {
            e.preventDefault();
            if (activeDragIndex === -1) return;

            const deltaY = e.clientY - startY;
            const draggedRect = initialRects[activeDragIndex];
            if (!draggedRect) return;

            const draggedCenter = draggedRect.top + draggedRect.height / 2 + deltaY;

            let newIndex = activeDragIndex;
            let minDistance = Infinity;
            for (let i = 0; i < initialRects.length; i++) {
                const rect = initialRects[i];
                const rectCenter = rect.top + rect.height / 2;
                const distance = Math.abs(draggedCenter - rectCenter);
                if (distance < minDistance) {
                    minDistance = distance;
                    newIndex = i;
                }
            }

            currentNewIndex = newIndex;

            itemElements.forEach((el, i) => {
                if (i === activeDragIndex) {
                    el.style.transform = `translateY(${deltaY}px) scale(1.05)`;
                    el.style.zIndex = "100";
                    el.style.position = "relative";
                    el.style.transition = "none";
                } else {
                    el.style.transition = "transform 0.2s cubic-bezier(0.2, 0, 0, 1)";
                    if (
                        activeDragIndex < newIndex &&
                        i > activeDragIndex &&
                        i <= newIndex
                    ) {
                        const shift = initialRects[i - 1].top - initialRects[i].top;
                        el.style.transform = `translateY(${shift}px)`;
                    } else if (
                        activeDragIndex > newIndex &&
                        i >= newIndex &&
                        i < activeDragIndex
                    ) {
                        const shift = initialRects[i + 1].top - initialRects[i].top;
                        el.style.transform = `translateY(${shift}px)`;
                    } else {
                        el.style.transform = "translateY(0px)";
                    }
                }
            });
        };

        const onPointerUp = (e: PointerEvent) => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);

            document.body.style.cursor = "";

            if (activeDragIndex !== -1 && itemElements[activeDragIndex]) {
                itemElements[activeDragIndex].releasePointerCapture(e.pointerId);
            }

            const oldIndex = activeDragIndex;
            const finalIndex = currentNewIndex;

            activeDragIndex = -1;

            // Keep transitions disabled while the parent commits the new DOM order.
            // Otherwise the old preview offsets can animate for one frame after drop.
            itemElements.forEach((el) => {
                el.style.transition = "none";
                el.style.transform = "none";
                el.style.zIndex = "";
                el.style.position = "";
                el.classList.remove("dragging");
            });

            if (oldIndex !== -1 && finalIndex !== -1 && oldIndex !== finalIndex) {
                onReorderRef.current(oldIndex, finalIndex);
            }

            releaseCleanupFrame = requestAnimationFrame(() => {
                itemElements.forEach((el) => {
                    el.style.transform = "";
                    el.style.transition = "";
                });
            });
        };

        container.addEventListener("pointerdown", onPointerDown);

        return () => {
            container.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
            if (releaseCleanupFrame !== undefined) {
                cancelAnimationFrame(releaseCleanupFrame);
            }
        };
    }, [disabled]);

    return { containerRef };
}
