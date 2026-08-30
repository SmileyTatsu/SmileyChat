const activeDialogStack: string[] = [];
let scrollLockCount = 0;
let originalOverflow = "";

export function pushDialog(id: string): void {
    activeDialogStack.push(id);
    if (typeof document !== "undefined") {
        if (scrollLockCount === 0) {
            originalOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        }
        scrollLockCount++;
    }
}

export function popDialog(id: string): void {
    const idx = activeDialogStack.lastIndexOf(id);
    if (idx === -1) {
        return;
    }
    activeDialogStack.splice(idx, 1);
    if (typeof document !== "undefined") {
        scrollLockCount = Math.max(0, scrollLockCount - 1);
        if (scrollLockCount === 0) {
            document.body.style.overflow = originalOverflow;
        }
    }
}

export function isTopmostDialog(id: string): boolean {
    return (
        activeDialogStack.length > 0 &&
        activeDialogStack[activeDialogStack.length - 1] === id
    );
}

export function getActiveDialogStack(): readonly string[] {
    return activeDialogStack;
}

export function resetDialogStackForTesting(): void {
    activeDialogStack.length = 0;
    scrollLockCount = 0;
    originalOverflow = "";
}
