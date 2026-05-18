import { Users } from "lucide-preact";

import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import type { ChatGroupMember } from "#frontend/types";

type GroupAvatarProps = {
    className?: string;
    customPath?: string;
    members: ChatGroupMember[];
};

export function GroupAvatar({ className = "", customPath, members }: GroupAvatarProps) {
    if (customPath) {
        return (
            <div className={`group-avatar custom ${className}`} aria-label="Group chat">
                <img src={customPath} alt="" />
            </div>
        );
    }

    const orderedMembers = members
        .slice()
        .sort((left, right) => left.order - right.order);
    const visibleMembers = orderedMembers.slice(0, 6);

    if (visibleMembers.length === 0) {
        return (
            <div className={`group-avatar ${className}`} aria-label="Group chat">
                <Users size={16} />
            </div>
        );
    }

    return (
        <div
            className={`group-avatar count-${Math.min(orderedMembers.length, 6)} ${className}`}
            aria-label="Group chat"
        >
            {visibleMembers.map((member) => (
                <span className="group-avatar-tile" key={member.characterId}>
                    <img
                        src={member.avatarPath || characterInitialAvatar(member.name)}
                        alt=""
                    />
                </span>
            ))}
        </div>
    );
}
