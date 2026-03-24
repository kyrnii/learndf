import { Component } from "../core/Component";
import { StateGraphDef, State } from "../core/StateCore";
import { StateTag } from "../core/Tags";

/**
 * Component that attaches a StateGraph (FSM) to an Entity.
 * Manages entering/exiting states, processing the timeline, and event routing.
 */
export class StateGraph extends Component {
    private sgDef: StateGraphDef | null = null;
    public currentState: State | null = null;
    
    private timeInState: number = 0;
    private timelineIndex: number = 0;

    // Track listener functions by event name so we can unregister them easily
    private sgEventListeners: Map<string, Array<(data: any) => void>> = new Map();
    private stateEventListeners: Map<string, Array<(data: any) => void>> = new Map();

    public onAdd(): void {
        this.inst.startUpdatingComponent(this);
    }

    public onRemove(): void {
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
        this.sgDef = null;
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
        this.timelineIndex = 0;

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

        return true;
    }

    public hasStateTag(tags: StateTag): boolean {
        return this.currentState ? this.currentState.hasTag(tags) : false;
    }

    public update(dt: number): void {
        if (!this.currentState) return;

        this.timeInState += dt;

        // Process Timeline Events
        const timeline = this.currentState.timeline;
        while (this.timelineIndex < timeline.length) {
            const evt = timeline[this.timelineIndex];
            if (this.timeInState >= evt.time) {
                evt.fn(this.inst);
                this.timelineIndex++;
            } else {
                break;
            }
        }

        // Process State onUpdate
        if (this.currentState.onUpdate) {
            this.currentState.onUpdate(this.inst, dt);
        }
    }
}
