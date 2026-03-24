import { Entity } from "./Entity";
import { StateTag } from "./Tags";

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
    tags?: StateTag;
    excludeTags?: StateTag;
    canEnter?: (inst: Entity, data?: any) => boolean;
    onEnter?: (inst: Entity, data?: any) => void;
    onExit?: (inst: Entity) => void;
    onUpdate?: (inst: Entity, dt: number) => void;
    timeline?: TimeEvent[];
    events?: EventHandler[];
}

/**
 * Basic representation of a FSM State.
 * Includes data for entering, exiting, updating, and timeline execution.
 */
export class State {
    public readonly name: string;
    public readonly tags: number;
    public readonly excludeTags: number;
    public readonly canEnter?: (inst: Entity, data?: any) => boolean;
    public readonly onEnter?: (inst: Entity, data?: any) => void;
    public readonly onExit?: (inst: Entity) => void;
    public readonly onUpdate?: (inst: Entity, dt: number) => void;
    public readonly timeline: TimeEvent[];
    public readonly events: EventHandler[];

    constructor(config: StateConfig) {
        this.name = config.name;
        this.tags = config.tags || 0;
        this.excludeTags = config.excludeTags || 0;
        this.canEnter = config.canEnter;
        this.onEnter = config.onEnter;
        this.onExit = config.onExit;
        this.onUpdate = config.onUpdate;
        
        // Sort timeline by time for proper execution order
        this.timeline = (config.timeline || []).sort((a, b) => a.time - b.time);
        this.events = config.events || [];
    }

    public hasTag(tags: StateTag): boolean {
        return (this.tags & tags) !== 0;
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
