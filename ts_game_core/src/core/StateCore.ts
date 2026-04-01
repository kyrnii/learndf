import { Entity } from "./Entity";
import { Tag, TagQuery, hasAnyTag, toTagArray } from "./Tags";

export interface TimeEvent {
    time: number;
    fn: (inst: Entity) => void;
}

export interface EventHandler {
    name: string;
    fn: (inst: Entity, data?: any) => void;
}

export interface StateConfig {
    name: string;
    tags?: TagQuery;
    excludeTags?: TagQuery;
    canEnter?: (inst: Entity, data?: any) => boolean;
    onEnter?: (inst: Entity, data?: any) => void;
    onExit?: (inst: Entity) => void;
    onUpdate?: (inst: Entity, dt: number) => void;
    onTimeout?: (inst: Entity) => void;
    timeline?: TimeEvent[];
    events?: EventHandler[];
}

/**
 * Basic representation of a FSM State.
 * Includes data for entering, exiting, updating, and timeline execution.
 */
export class State {
    public readonly name: string;
    public readonly tags: Set<Tag>;
    public readonly excludeTags: Set<Tag>;
    public readonly canEnter?: (inst: Entity, data?: any) => boolean;
    public readonly onEnter?: (inst: Entity, data?: any) => void;
    public readonly onExit?: (inst: Entity) => void;
    public readonly onUpdate?: (inst: Entity, dt: number) => void;
    public readonly onTimeout?: (inst: Entity) => void;
    public readonly timeline: TimeEvent[];
    public readonly events: EventHandler[];

    constructor(config: StateConfig) {
        this.name = config.name;
        this.tags = new Set(toTagArray(config.tags));
        this.excludeTags = new Set(toTagArray(config.excludeTags));
        this.canEnter = config.canEnter;
        this.onEnter = config.onEnter;
        this.onExit = config.onExit;
        this.onUpdate = config.onUpdate;
        this.onTimeout = config.onTimeout;
        
        // Sort timeline by time for proper execution order
        this.timeline = (config.timeline || []).sort((a, b) => a.time - b.time);
        this.events = config.events || [];
    }

    public hasTag(tags: TagQuery): boolean {
        return hasAnyTag(this.tags, tags);
    }
}

export interface StateGraphConfig {
    states: State[];
    events?: EventHandler[]; // Global SG events that can interrupt states
    defaultState?: string;
}

/**
 * Defines a structural collection of states and global events.
 * This is stateless itself; an Entity runs it via the StateGraph component.
 */
export class StateGraphDef {
    public readonly states: Map<string, State> = new Map();
    public readonly events: Map<string, EventHandler[]> = new Map();
    public readonly defaultState: string | null = null;

    constructor(config: StateGraphConfig) {
        for (const state of config.states) {
            this.states.set(state.name, state);
        }

        if (config.events) {
            for (const evt of config.events) {
                if (!this.events.has(evt.name)) {
                    this.events.set(evt.name, []);
                }
                this.events.get(evt.name)!.push(evt);
            }
        }

        this.defaultState = config.defaultState || null;
    }
}
