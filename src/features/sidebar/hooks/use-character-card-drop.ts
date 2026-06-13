import { useRef, useState } from "preact/hooks";

import { hasDraggedFiles, isCharacterCardFile } from "../sidebar-helpers";

export function useCharacterCardDrop({
    onImportCharacterFiles,
}: {
    onImportCharacterFiles: (files: File[]) => void;
}) {
    const dragDepthRef = useRef(0);
    const [isCharacterDropActive, setIsCharacterDropActive] = useState(false);

    function importFiles(files: File[]) {
        const characterFiles = files.filter(isCharacterCardFile);

        if (characterFiles.length) {
            onImportCharacterFiles(characterFiles);
        }
    }

    function handleCharacterDragEnter(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        event.preventDefault();
        dragDepthRef.current += 1;
        setIsCharacterDropActive(true);
    }

    function handleCharacterDragOver(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer!.dropEffect = "copy";
    }

    function handleCharacterDragLeave(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

        if (dragDepthRef.current === 0) {
            setIsCharacterDropActive(false);
        }
    }

    function handleCharacterDrop(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        event.preventDefault();
        dragDepthRef.current = 0;
        setIsCharacterDropActive(false);
        importFiles(Array.from(event.dataTransfer?.files ?? []));
    }

    return {
        handleCharacterDragEnter,
        handleCharacterDragLeave,
        handleCharacterDragOver,
        handleCharacterDrop,
        importFiles,
        isCharacterDropActive,
    };
}
