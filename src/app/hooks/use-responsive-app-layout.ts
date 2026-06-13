import { computed } from "@preact/signals";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import {
    desktopCharacterOpen,
    desktopSidebarOpen,
    mobileCharacterOpen,
    mobileSidebarOpen,
} from "../ui-state";

const MOBILE_SIDEBAR_BREAKPOINT = 820;
const CHARACTER_DRAWER_BREAKPOINT = 1120;

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const mediaQuery = window.matchMedia(query);
        const handleChange = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        setMatches(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);

        return () => {
            mediaQuery.removeEventListener("change", handleChange);
        };
    }, [query]);

    return matches;
}

export function useResponsiveAppLayout() {
    const isMobileLayout = useMediaQuery(`(max-width: ${MOBILE_SIDEBAR_BREAKPOINT}px)`);
    const isCharacterDrawerLayout = useMediaQuery(
        `(max-width: ${CHARACTER_DRAWER_BREAKPOINT}px)`,
    );
    const previousIsMobileLayoutRef = useRef(isMobileLayout);
    const previousIsCharacterDrawerLayoutRef = useRef(isCharacterDrawerLayout);

    const sidebarOpenSignal = useMemo(
        () =>
            computed(() =>
                isMobileLayout ? mobileSidebarOpen.value : desktopSidebarOpen.value,
            ),
        [isMobileLayout],
    );
    const characterOpenSignal = useMemo(
        () =>
            computed(() =>
                isCharacterDrawerLayout
                    ? mobileCharacterOpen.value
                    : desktopCharacterOpen.value,
            ),
        [isCharacterDrawerLayout],
    );

    useEffect(() => {
        if (previousIsMobileLayoutRef.current !== isMobileLayout) {
            mobileSidebarOpen.value = false;
            previousIsMobileLayoutRef.current = isMobileLayout;
        }

        if (previousIsCharacterDrawerLayoutRef.current !== isCharacterDrawerLayout) {
            mobileCharacterOpen.value = false;
            previousIsCharacterDrawerLayoutRef.current = isCharacterDrawerLayout;
        }
    }, [isCharacterDrawerLayout, isMobileLayout]);

    function setActiveSidebarOpen(isOpen: boolean) {
        if (isMobileLayout) {
            mobileSidebarOpen.value = isOpen;
            return;
        }

        desktopSidebarOpen.value = isOpen;
    }

    function setActiveCharacterOpen(isOpen: boolean) {
        if (isCharacterDrawerLayout) {
            mobileCharacterOpen.value = isOpen;
            return;
        }

        desktopCharacterOpen.value = isOpen;
    }

    function toggleSidebar() {
        if (isMobileLayout) {
            mobileSidebarOpen.value = !mobileSidebarOpen.value;
            mobileCharacterOpen.value = false;
            return;
        }

        desktopSidebarOpen.value = !desktopSidebarOpen.value;

        if (isCharacterDrawerLayout) {
            mobileCharacterOpen.value = false;
        } else {
            desktopCharacterOpen.value = false;
        }
    }

    function toggleCharacter() {
        if (isCharacterDrawerLayout) {
            mobileCharacterOpen.value = !mobileCharacterOpen.value;

            if (isMobileLayout) {
                mobileSidebarOpen.value = false;
            } else {
                desktopSidebarOpen.value = false;
            }

            return;
        }

        desktopCharacterOpen.value = !desktopCharacterOpen.value;
        desktopSidebarOpen.value = false;
    }

    return {
        characterOpenSignal,
        isCharacterDrawerLayout,
        isMobileLayout,
        setActiveCharacterOpen,
        setActiveSidebarOpen,
        sidebarOpenSignal,
        toggleCharacter,
        toggleSidebar,
    };
}
