import { type ReadonlySignal } from "@preact/signals";
import { memo } from "preact/compat";
import { useEffect, useState } from "preact/hooks";

import { CharacterPanel } from "#frontend/features/characters/character-panel";
import { GroupPanel } from "#frontend/features/characters/group-panel";
import { OptionsModal } from "#frontend/features/settings/options-modal";
import { SidebarContainer } from "#frontend/features/sidebar/sidebar";

import { mobileCharacterOpen, mobileSidebarOpen, settingsOpen } from "../ui-state";

const BACKDROP_TRANSITION_MS = 200;
const SWIPE_EDGE_PX = 24;
const SWIPE_THRESHOLD_PX = 70;
const SWIPE_VERTICAL_CANCEL_PX = 60;

type OptionsModalHostProps = Parameters<typeof OptionsModal>[0];

type SidebarHostProps = Omit<Parameters<typeof SidebarContainer>[0], "isOpen"> & {
    isOpenSignal: ReadonlySignal<boolean>;
};

export const SidebarHost = memo(function SidebarHost({
    isOpenSignal,
    ...props
}: SidebarHostProps) {
    return <SidebarContainer {...props} isOpen={isOpenSignal.value} />;
});

type CharacterPanelHostProps = Omit<Parameters<typeof CharacterPanel>[0], "isOpen"> & {
    isOpenSignal: ReadonlySignal<boolean>;
};

export const CharacterPanelHost = memo(function CharacterPanelHost({
    isOpenSignal,
    ...props
}: CharacterPanelHostProps) {
    return <CharacterPanel {...props} isOpen={isOpenSignal.value} />;
});

type GroupPanelHostProps = Omit<Parameters<typeof GroupPanel>[0], "isOpen"> & {
    isOpenSignal: ReadonlySignal<boolean>;
};

export const GroupPanelHost = memo(function GroupPanelHost({
    isOpenSignal,
    ...props
}: GroupPanelHostProps) {
    return <GroupPanel {...props} isOpen={isOpenSignal.value} />;
});

export function ResponsiveBackdrops({
    characterOpenSignal,
    hasCharacters,
    isCharacterDrawerLayout,
    isMobileLayout,
    sidebarOpenSignal,
}: {
    characterOpenSignal: ReadonlySignal<boolean>;
    hasCharacters: boolean;
    isCharacterDrawerLayout: boolean;
    isMobileLayout: boolean;
    sidebarOpenSignal: ReadonlySignal<boolean>;
}) {
    useEffect(() => {
        if (!isMobileLayout) {
            return;
        }

        let startX = 0;
        let startY = 0;
        let tracking = false;

        function handlePointerDown(event: PointerEvent) {
            if (event.pointerType === "mouse") {
                return;
            }

            startX = event.clientX;
            startY = event.clientY;
            tracking = true;
        }

        function handlePointerUp(event: PointerEvent) {
            if (!tracking) {
                return;
            }

            tracking = false;

            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;

            if (
                Math.abs(deltaX) < SWIPE_THRESHOLD_PX ||
                Math.abs(deltaY) > SWIPE_VERTICAL_CANCEL_PX
            ) {
                return;
            }

            if (sidebarOpenSignal.value && deltaX < 0) {
                mobileSidebarOpen.value = false;
                return;
            }

            if (characterOpenSignal.value && deltaX > 0) {
                mobileCharacterOpen.value = false;
                return;
            }

            if (
                !sidebarOpenSignal.value &&
                !characterOpenSignal.value &&
                startX <= SWIPE_EDGE_PX &&
                deltaX > 0
            ) {
                mobileSidebarOpen.value = true;
                return;
            }

            if (
                hasCharacters &&
                !sidebarOpenSignal.value &&
                !characterOpenSignal.value &&
                startX >= window.innerWidth - SWIPE_EDGE_PX &&
                deltaX < 0
            ) {
                mobileCharacterOpen.value = true;
            }
        }

        window.addEventListener("pointerdown", handlePointerDown, { passive: true });
        window.addEventListener("pointerup", handlePointerUp, { passive: true });

        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [characterOpenSignal, hasCharacters, isMobileLayout, sidebarOpenSignal]);

    return (
        <>
            <AnimatedBackdrop
                className="sidebar-mobile-backdrop"
                isOpen={isMobileLayout && sidebarOpenSignal.value}
                onClick={() => {
                    mobileSidebarOpen.value = false;
                }}
            />
            <AnimatedBackdrop
                className="character-mobile-backdrop"
                isOpen={
                    isCharacterDrawerLayout && hasCharacters && characterOpenSignal.value
                }
                onClick={() => {
                    mobileCharacterOpen.value = false;
                }}
            />
        </>
    );
}

function AnimatedBackdrop({
    className,
    isOpen,
    onClick,
}: {
    className: string;
    isOpen: boolean;
    onClick: () => void;
}) {
    const [isMounted, setIsMounted] = useState(isOpen);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        let animationFrame = 0;
        let timeout = 0;

        if (isOpen) {
            setIsMounted(true);
            animationFrame = window.requestAnimationFrame(() => {
                setIsVisible(true);
            });
        } else {
            setIsVisible(false);
            timeout = window.setTimeout(() => {
                setIsMounted(false);
            }, BACKDROP_TRANSITION_MS);
        }

        return () => {
            if (animationFrame) {
                window.cancelAnimationFrame(animationFrame);
            }

            if (timeout) {
                window.clearTimeout(timeout);
            }
        };
    }, [isOpen]);

    if (!isMounted) {
        return null;
    }

    return (
        <div
            className={`${className}${isVisible ? "open" : ""}`}
            role="presentation"
            onClick={onClick}
        />
    );
}

export const OptionsModalHost = memo(function OptionsModalHost(
    props: OptionsModalHostProps,
) {
    if (!settingsOpen.value) {
        return null;
    }

    return <OptionsModal {...props} />;
});
