import { Menu, Paperclip, UserRound } from "lucide-preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";

type ComposerMenuProps = {
    disabled?: boolean;
    onAttach: () => void;
    onImpersonate: () => void;
};

export function ComposerMenu({ disabled, onAttach, onImpersonate }: ComposerMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    useEffect(() => {
        if (disabled) setIsOpen(false);
    }, [disabled]);

    useEffect(() => {
        if (!isOpen) return;
        menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        const closeOutside = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        return () => document.removeEventListener("pointerdown", closeOutside);
    }, [isOpen]);

    function closeMenu() {
        setIsOpen(false);
        triggerRef.current?.focus();
    }

    function handleMenuKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
        } else if (event.key === "Tab") {
            setIsOpen(false);
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const items = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
            );
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
                event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                        items.length;
            items[next]?.focus();
        }
    }

    return (
        <div className="composer-menu-wrap" ref={containerRef}>
            <button
                ref={triggerRef}
                type="button"
                title="Composer menu"
                aria-label="Composer menu"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                disabled={disabled}
                className="composer-menu-button"
                onClick={() => setIsOpen((open) => !open)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        setIsOpen(true);
                    }
                }}
            >
                <Menu size={18} aria-hidden="true" />
            </button>
            {isOpen && !disabled && (
                <div
                    id={menuId}
                    className="composer-menu"
                    role="menu"
                    aria-label="Composer actions"
                    ref={menuRef}
                    onKeyDown={handleMenuKeyDown}
                >
                    <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => {
                            closeMenu();
                            onAttach();
                        }}
                    >
                        <Paperclip size={16} aria-hidden="true" />
                        Attach
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => {
                            closeMenu();
                            onImpersonate();
                        }}
                    >
                        <UserRound size={16} fill="currentColor" aria-hidden="true" />
                        Impersonate
                    </button>
                </div>
            )}
        </div>
    );
}
