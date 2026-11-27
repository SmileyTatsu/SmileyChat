/**
 * Alert the user that a reply finished while they were elsewhere. Everything
 * here is browser-only and must stay harmless when `Notification`, Web Audio or
 * a focused window is unavailable (tests, SSR-ish stubs, denied permissions).
 */

export type GenerationAlertPreferences = {
    desktop: boolean;
    sound: boolean;
    onlyWhenUnfocused: boolean;
};

export function shouldAlertGenerationComplete({
    documentHidden,
    preferences,
    windowFocused,
}: {
    documentHidden: boolean;
    preferences: GenerationAlertPreferences;
    windowFocused: boolean;
}) {
    if (!preferences.desktop && !preferences.sound) {
        return false;
    }

    if (!preferences.onlyWhenUnfocused) {
        return true;
    }

    return documentHidden || !windowFocused;
}

/** First slice of the reply that reads well in a notification. */
export function summarizeReply(text: string, limit = 140) {
    const cleaned = text
        .replace(/<\/?msg(?:\s+[^>]*)?>/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (cleaned.length <= limit) {
        return cleaned;
    }

    return `${cleaned.slice(0, limit - 1).trimEnd()}…`;
}

type AudioContextConstructor = typeof AudioContext;

let audioContext: AudioContext | undefined;

function getAudioContext(): AudioContext | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }

    const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextConstructor })
            .webkitAudioContext;

    if (!Ctor) {
        return undefined;
    }

    try {
        audioContext ??= new Ctor();
        return audioContext;
    } catch {
        return undefined;
    }
}

/**
 * Called from the settings toggle so the context is created inside a user
 * gesture; browsers keep later programmatic chimes working after that.
 */
export function primeGenerationAlertAudio() {
    const context = getAudioContext();

    if (context?.state === "suspended") {
        void context.resume().catch(() => {});
    }
}

export function playGenerationChime() {
    const context = getAudioContext();

    if (!context) {
        return;
    }

    if (context.state === "suspended") {
        void context.resume().catch(() => {});
    }

    try {
        const start = context.currentTime + 0.01;
        const master = context.createGain();
        master.gain.value = 0.05;
        master.connect(context.destination);

        for (const note of [
            { frequency: 784, offset: 0 },
            { frequency: 1046.5, offset: 0.09 },
        ]) {
            const oscillator = context.createOscillator();
            const envelope = context.createGain();
            const at = start + note.offset;

            oscillator.type = "sine";
            oscillator.frequency.value = note.frequency;
            envelope.gain.setValueAtTime(0.0001, at);
            envelope.gain.linearRampToValueAtTime(1, at + 0.012);
            envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);

            oscillator.connect(envelope);
            envelope.connect(master);
            oscillator.start(at);
            oscillator.stop(at + 0.22);
        }
    } catch {
        // Audio is decorative; never break generation reporting over it.
    }
}

export type DesktopNotificationPermission = NotificationPermission | "unsupported";

export function desktopNotificationPermission(): DesktopNotificationPermission {
    if (typeof Notification === "undefined") {
        return "unsupported";
    }

    return Notification.permission;
}

export function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
    const current = desktopNotificationPermission();

    if (current !== "default") {
        return Promise.resolve(current);
    }

    try {
        return Notification.requestPermission().catch(() => "unsupported" as const);
    } catch {
        return Promise.resolve("unsupported");
    }
}

function showDesktopNotification({
    body,
    characterName,
}: {
    body: string;
    characterName: string;
}) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
    }

    try {
        const notification = new Notification(`${characterName} replied`, {
            body: summarizeReply(body) || "A new reply arrived.",
            tag: "smileychat-reply",
            silent: true,
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch {
        // Some platforms reject notifications created outside a service worker.
    }
}

export function alertGenerationComplete({
    body,
    characterName,
    preferences,
}: {
    body: string;
    characterName: string;
    preferences: GenerationAlertPreferences;
}) {
    if (typeof document === "undefined") {
        return;
    }

    const windowFocused =
        typeof document.hasFocus === "function" ? document.hasFocus() : true;

    if (
        !shouldAlertGenerationComplete({
            documentHidden: document.visibilityState === "hidden",
            preferences,
            windowFocused,
        })
    ) {
        return;
    }

    if (preferences.sound) {
        playGenerationChime();
    }

    if (preferences.desktop) {
        showDesktopNotification({ body, characterName });
    }
}
