export type Tag = string;
export type TagQuery = Tag | Tag[];

export const EntityTag = {
    Player: "player",
    Monster: "monster",
    Spider: "spider",
    Character: "character",
} as const;

export const StateTag = {
    Idle: "idle",
    Busy: "busy",
    Attack: "attack",
    Dead: "dead",
    Hit: "hit",
    CanRotate: "canrotate",
} as const;

export function toTagArray(tags?: TagQuery | null): Tag[] {
    if (!tags) {
        return [];
    }
    return Array.isArray(tags) ? tags : [tags];
}

export function hasAnyTag(source: Iterable<Tag>, query?: TagQuery | null): boolean {
    const queries = toTagArray(query);
    if (queries.length === 0) {
        return false;
    }

    const sourceSet = source instanceof Set ? source : new Set(source);
    return queries.some((tag) => sourceSet.has(tag));
}

export function hasAllTags(source: Iterable<Tag>, query?: TagQuery | null): boolean {
    const queries = toTagArray(query);
    if (queries.length === 0) {
        return true;
    }

    const sourceSet = source instanceof Set ? source : new Set(source);
    return queries.every((tag) => sourceSet.has(tag));
}
