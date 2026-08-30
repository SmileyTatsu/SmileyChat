import { type ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { AlertTriangle, Loader2, Trash2 } from "lucide-preact";
import { isTopmostDialog, popDialog, pushDialog } from "./dialog-manager";

export type ConfirmDialogVariant = "danger" | "default";

export interface ConfirmDialogProps {
    title: string;
    message?: ComponentChildren;
    details?: string[];
    body?: ComponentChildren;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    icon?: ComponentChildren;
    confirmIcon?: ComponentChildren;
    onConfirm?: () => void | Promise<void>;
    onClose: () => void;
    children?: ComponentChildren;
    isBusy?: boolean;
    confirmDisabled?: boolean;
    autoFocusButton?: "confirm" | "cancel" | "none";
    className?: string;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
}

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
    title,
    message,
    details,
    body,
    confirmLabel,
    cancelLabel = "Cancel",
    variant = "default",
    icon,
    confirmIcon,
    onConfirm,
    onClose,
    children,
    isBusy = false,
    confirmDisabled = false,
    autoFocusButton,
    className,
    closeOnBackdrop = true,
    closeOnEscape = true,
}: ConfirmDialogProps) {
    const dialogId = useId();
    const titleId = `confirm-dialog-title-${dialogId}`;
    const messageId = `confirm-dialog-desc-${dialogId}`;
    const errorId = `confirm-dialog-err-${dialogId}`;

    const dialogRef = useRef<HTMLElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const previousActiveElementRef = useRef<HTMLElement | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const effectiveBusy = isBusy || isSubmitting;

    const effectiveConfirmLabel =
        confirmLabel ?? (variant === "danger" ? "Delete" : "Confirm");

    const headerIcon =
        icon !== undefined ? (
            icon
        ) : variant === "danger" ? (
            <AlertTriangle size={19} aria-hidden="true" />
        ) : null;

    const defaultConfirmIcon =
        variant === "danger" ? <Trash2 size={15} aria-hidden="true" /> : null;
    const resolvedConfirmIcon =
        confirmIcon !== undefined ? confirmIcon : defaultConfirmIcon;

    useEffect(() => {
        pushDialog(dialogId);

        if (typeof document !== "undefined") {
            previousActiveElementRef.current =
                document.activeElement as HTMLElement | null;
        }

        const timer =
            typeof window !== "undefined"
                ? window.setTimeout(() => {
                      if (autoFocusButton === "cancel" && cancelButtonRef.current) {
                          cancelButtonRef.current.focus();
                      } else if (
                          autoFocusButton === "confirm" &&
                          confirmButtonRef.current
                      ) {
                          confirmButtonRef.current.focus();
                      } else if (autoFocusButton === "none") {
                          dialogRef.current?.focus();
                      } else {
                          if (variant === "danger" && cancelButtonRef.current) {
                              cancelButtonRef.current.focus();
                          } else if (confirmButtonRef.current) {
                              confirmButtonRef.current.focus();
                          } else if (cancelButtonRef.current) {
                              cancelButtonRef.current.focus();
                          } else {
                              dialogRef.current?.focus();
                          }
                      }
                  }, 0)
                : null;

        return () => {
            const wasTopmost = isTopmostDialog(dialogId);
            popDialog(dialogId);
            if (timer !== null && typeof window !== "undefined") {
                window.clearTimeout(timer);
            }
            if (wasTopmost) {
                previousActiveElementRef.current?.focus();
            }
        };
    }, [dialogId, autoFocusButton, variant]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        function handleGlobalKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && closeOnEscape && !effectiveBusy) {
                if (isTopmostDialog(dialogId)) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    onClose();
                }
            }
        }

        window.addEventListener("keydown", handleGlobalKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleGlobalKeyDown, true);
        };
    }, [dialogId, closeOnEscape, effectiveBusy, onClose]);

    function handleDialogKeyDown(event: KeyboardEvent) {
        if (event.key === "Tab") {
            if (!dialogRef.current || typeof document === "undefined") return;

            const focusableElements = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

            if (focusableElements.length === 0) {
                event.preventDefault();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey) {
                if (
                    document.activeElement === firstElement ||
                    !dialogRef.current.contains(document.activeElement)
                ) {
                    event.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (
                    document.activeElement === lastElement ||
                    !dialogRef.current.contains(document.activeElement)
                ) {
                    event.preventDefault();
                    firstElement.focus();
                }
            }
        }
    }

    async function handleConfirmClick(event?: MouseEvent | Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (effectiveBusy || confirmDisabled) return;
        if (!onConfirm) return;

        setErrorMessage(null);
        setIsSubmitting(true);
        try {
            await onConfirm();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : typeof error === "string"
                      ? error
                      : "An unexpected error occurred.";
            setErrorMessage(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleBackdropClick(event: MouseEvent) {
        if (
            event.target === event.currentTarget &&
            closeOnBackdrop &&
            !effectiveBusy &&
            isTopmostDialog(dialogId)
        ) {
            onClose();
        }
    }

    const hasBodyContent = Boolean(
        message || body || (details && details.length > 0) || errorMessage,
    );

    return (
        <div
            className="confirm-dialog-backdrop message-confirm-backdrop"
            role="presentation"
            onClick={handleBackdropClick}
        >
            <section
                ref={dialogRef}
                className={`confirm-dialog message-confirm-dialog compact variant-${variant} ${
                    className ?? ""
                }`.trim()}
                role={variant === "danger" ? "alertdialog" : "dialog"}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={hasBodyContent ? messageId : undefined}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleDialogKeyDown}
            >
                <header className="confirm-dialog-header">
                    {headerIcon}
                    <h2 id={titleId}>{title}</h2>
                </header>

                {hasBodyContent && (
                    <div id={messageId} className="confirm-dialog-body">
                        {errorMessage && (
                            <div
                                id={errorId}
                                className="confirm-dialog-error"
                                role="alert"
                            >
                                <AlertTriangle size={15} aria-hidden="true" />
                                <span>{errorMessage}</span>
                            </div>
                        )}
                        {typeof message === "string" ? <p>{message}</p> : message}
                        {body}
                        {details && details.length > 0 && (
                            <div className="confirm-dialog-details preset-confirm-details">
                                {details.map((detail, index) => (
                                    <p key={`${index}-${detail}`}>{detail}</p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="confirm-dialog-actions message-confirm-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        disabled={effectiveBusy}
                        onClick={onClose}
                    >
                        {cancelLabel}
                    </button>

                    {children}

                    {onConfirm && (
                        <button
                            ref={confirmButtonRef}
                            type="button"
                            className={
                                variant === "danger" ? "danger-button" : "primary-button"
                            }
                            disabled={effectiveBusy || confirmDisabled}
                            onClick={handleConfirmClick}
                        >
                            {effectiveBusy ? (
                                <Loader2
                                    size={15}
                                    className="confirm-dialog-spin"
                                    aria-hidden="true"
                                />
                            ) : (
                                resolvedConfirmIcon
                            )}
                            {effectiveConfirmLabel}
                        </button>
                    )}
                </div>
            </section>
        </div>
    );
}
