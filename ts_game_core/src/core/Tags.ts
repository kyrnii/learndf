/**
 * Tags for describing an Entity's nature or base capabilities.
 * Defined as bitmasks for high-performance checking.
 */
export enum EntityTag {
    None      = 0,
    Player    = 1 << 0,
    Monster   = 1 << 1,
    Spider    = 1 << 2,
    Character = 1 << 3
}

/**
 * Tags for describing the current logical state of a StateGraph.
 * Defined as bitmasks for high-performance checking.
 */
export enum StateTag {
    None      = 0,
    Idle      = 1 << 0,
    Busy      = 1 << 1,
    Attack    = 1 << 2,
    Dead      = 1 << 3,
    Hit       = 1 << 4,
    CanRotate = 1 << 5
}
