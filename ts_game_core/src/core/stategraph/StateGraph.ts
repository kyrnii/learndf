import { Entity } from "../Entity";
import { StateGraphDef, State } from "../StateCore";
import { StateTag } from "../Tags";
import { SGManager } from "./SGManager";

/**
 * Native StateGraph runner for an Entity.
 * Manages entering/exiting states, processing the timeline, and event routing.
 */
export class StateGraph {
    public inst!: Entity;
    private sgDef: StateGraphDef;
    public currentState: State | null = null;
    
    private timeInState: number = 0;
    private timelineIndex: number | null = null;
    private timeout: number | null = null;

    // Track listener functions by event name so we can unregister them easily
    private sgEventListeners: Map<string, Array<(data: any) => void>> = new Map();
    private stateEventListeners: Map<string, Array<(data: any) => void>> = new Map();

    constructor(sgDef: StateGraphDef) {
        this.sgDef = sgDef;
    }

    public start(): void {
        SGManager.getInstance().addInstance(this);
    }

    public stop(): void {
        SGManager.getInstance().removeInstance(this);
        this.clearStateGraph();
    }

    public setStateGraph(sgDef: StateGraphDef): void {
        this.clearStateGraph();
        this.sgDef = sgDef;
        
        // Register SG global events to the entity
        for (const [eventName, handlers] of sgDef.events) {
            const boundHandlers: Array<(data: any) => void> = [];
            for (const handler of handlers) {
                const boundFn = (data: any) => handler.fn(this.inst, data);
                this.inst.listenForEvent(eventName, boundFn);
                boundHandlers.push(boundFn);
            }
            this.sgEventListeners.set(eventName, boundHandlers);
        }

        if (sgDef.defaultState) {
            this.goToState(sgDef.defaultState);
        }
    }

    public clearStateGraph(): void {
        if (this.currentState && this.currentState.onExit) {
            this.currentState.onExit(this.inst);
        }

        this.clearStateEvents();

        // Unregister global events
        for (const [eventName, handlers] of this.sgEventListeners) {
            for (const handler of handlers) {
                this.inst.removeEventCallback(eventName, handler);
            }
        }
        this.sgEventListeners.clear();

        this.currentState = null;
        this.timeInState = 0;
    }

    private clearStateEvents(): void {
        for (const [eventName, handlers] of this.stateEventListeners) {
            for (const handler of handlers) {
                this.inst.removeEventCallback(eventName, handler);
            }
        }
        this.stateEventListeners.clear();
    }

    public goToState(stateName: string, data?: any): boolean {
        if (!this.sgDef) return false;

        const nextState = this.sgDef.states.get(stateName);
        if (!nextState) {
            console.warn(`[StateGraph] State '${stateName}' does not exist on entity ${this.inst.prefabName}`);
            return false;
        }

        // Check if transition is blocked by excludeTags
        if (nextState.excludeTags !== 0 && this.hasStateTag(nextState.excludeTags)) {
            return false;
        }

        // Check if custom canEnter guard allows transition
        if (nextState.canEnter && !nextState.canEnter(this.inst, data)) {
            return false;
        }

        // Exit current state
        if (this.currentState && this.currentState.onExit) {
            this.currentState.onExit(this.inst);
        }
        this.clearStateEvents();

        // Enter new state
        this.currentState = nextState;
        this.timeInState = 0;
        this.timeout = null;

        if (this.currentState.timeline.length > 0) {
            this.timelineIndex = 0;
        } else {
            this.timelineIndex = null;
        }

        // Register state-specific events
        for (const evt of this.currentState.events) {
            const boundFn = (eventData: any) => evt.fn(this.inst, eventData);
            if (!this.stateEventListeners.has(evt.name)) {
                this.stateEventListeners.set(evt.name, []);
            }
            this.stateEventListeners.get(evt.name)!.push(boundFn);
            this.inst.listenForEvent(evt.name, boundFn);
        }

        if (this.currentState.onEnter) {
            this.currentState.onEnter(this.inst, data);
        }

        SGManager.getInstance().onEnterNewState(this);

        return true;
    }

    public hasStateTag(tags: StateTag): boolean {
        return this.currentState ? this.currentState.hasTag(tags) : false;
    }

    public setTimeout(time: number): void {
        this.timeout = time;
        SGManager.getInstance().wake(this);
    }

    public updateState(dt: number): number | null {
        if (!this.currentState) return null;

        this.timeInState += dt;
        let startState = this.currentState;

        if (this.timeout !== null) {
            this.timeout -= dt;
            if (this.timeout <= 0) {
                this.timeout = null;
                if (this.currentState.onTimeout) {
                    this.currentState.onTimeout(this.inst);
                    if (startState !== this.currentState) {
                        return 0; // Tick immediately
                    }
                }
            }
        }

        // Process Timeline Events
        const timeline = this.currentState.timeline;
        while (this.timelineIndex !== null && this.timelineIndex < timeline.length) {
            const evt = timeline[this.timelineIndex];
            if (this.timeInState >= evt.time) {
                const oldTime = this.timeInState;
                const extraTime = this.timeInState - evt.time;

                evt.fn(this.inst);
                this.timelineIndex++;

                if (startState !== this.currentState || oldTime > this.timeInState) {
                    // State changed! If startState != this.currentState, evaluate new state immediately
                    return 0;
                }
            } else {
                break;
            }
        }

        // Process State onUpdate
        if (this.currentState.onUpdate) {
            this.currentState.onUpdate(this.inst, dt);
        }

        let timeToSleep: number | null = null;
        if (this.timelineIndex !== null && this.timelineIndex < timeline.length) {
            timeToSleep = timeline[this.timelineIndex].time - this.timeInState;
        }

        if (this.timeout !== null && (timeToSleep === null || timeToSleep > this.timeout)) {
            timeToSleep = this.timeout;
        }

        if (this.currentState.onUpdate) {
            return 0;
        } else if (timeToSleep !== null) {
            return Math.max(0, timeToSleep);
        } else {
            return null;
        }
    }
}
