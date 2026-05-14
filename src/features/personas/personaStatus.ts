import type { UserStatus } from "../../types";

export function formatStatus(status: UserStatus) {
    if (status === "away") {
        return "Away";
    }

    if (status === "dnd") {
        return "Do Not Disturb";
    }

    if (status === "offline") {
        return "Offline";
    }

    return "Online";
}
