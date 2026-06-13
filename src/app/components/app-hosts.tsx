import { type ReadonlySignal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";

import { CharacterPanel } from "#frontend/features/characters/character-panel";
import { GroupPanel } from "#frontend/features/characters/group-panel";
import { OptionsModal } from "#frontend/features/settings/options-modal";
import { Sidebar } from "#frontend/features/sidebar/sidebar";

import { mobileCharacterOpen, mobileSidebarOpen, settingsOpen } from "../ui-state";

const BACKDROP_TRANSITION_MS = 200;

type OptionsModalHostProps = Parameters<typeof OptionsModal>[0];

type SidebarHostProps = Omit<Parameters<typeof Sidebar>[0], "isOpen"> & {
    isOpenSignal: ReadonlySignal<boolean>;
};

export function SidebarHost({ isOpenSignal, ...props }: SidebarHostProps) {
    return <Sidebar {...props} isOpen={isOpenSignal.value} />;
}

type CharacterPanelHostProps = Omit<Parameters<typeof CharacterPanel>[0], "isOpen"> & {
    isOpenSignal: ReadonlySignal<boolean>;
};

export function CharacterPanelHost({ isOpenSignal, ...props }: CharacterPanelHostProps) {
    return <CharacterPanel {...props} isOpen={isOpenSignal.value} />;
}

type GroupPanelHostProps = Omit<Parameters<typeof GroupPanel>[0], "isOpen"> & {
    isOpenSignal: ReadonlySignal<boolean>;
};

export function GroupPanelHost({ isOpenSignal, ...props }: GroupPanelHostProps) {
    return <GroupPanel {...props} isOpen={isOpenSignal.value} />;
}

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

export function OptionsModalHost(props: OptionsModalHostProps) {
    if (!settingsOpen.value) {
        return null;
    }

    return <OptionsModal {...props} />;
}
