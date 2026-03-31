import { EventEmitter, EventHandler } from './EventEmitter';
import { Component } from "./Component";
import { StateTag, EntityTag } from "./Tags";
import type { Brain } from "./behavior/Brain";
import type { StateGraph } from "./stategraph/StateGraph";
import { Transform } from "../components/Transform";

// Utility type to define the constructor of a Component class
export type ComponentConstructor<T extends Component> = new (inst: Entity) => T;

export class Entity {
    private static nextId: number = 1;

    public readonly GUID: number;
    public prefabName: string = "Unnamed";
    public isValid: boolean = true;

    // Core systems
    private components: Map<Function, Component> = new Map();
    private updateComponents: Set<Component> = new Set();

    // Native sub-systems
    public brain: Brain | null = null;
    public sg: StateGraph | null = null;
    private tags: number = 0;
    private eventEmitter: EventEmitter = new EventEmitter();

    constructor() {
        this.GUID = Entity.nextId++;
    }

    // ============================================
    // Tag System
    // ============================================

    public addTag(tags: EntityTag): void {
        this.tags |= tags;
    }

    public removeTag(tags: EntityTag): void {
        this.tags &= ~tags;
    }

    public hasTag(tags: EntityTag): boolean {
        // Returns true if ANY of the requested tags are present
        return (this.tags & tags) !== 0;
    }

    public hasAllTags(tags: EntityTag): boolean {
        // Returns true only if ALL of the requested tags are present
        return (this.tags & tags) === tags;
    }

    public hasAnyTag(tags: EntityTag): boolean {
        // Same as hasTag
        return this.hasTag(tags);
    }

    // ============================================
    // Event System
    // ============================================

    public listenForEvent(event: string, handler: EventHandler): void {
        this.eventEmitter.on(event, handler);
    }

    public removeEventCallback(event: string, handler: EventHandler): void {
        this.eventEmitter.off(event, handler);
    }

    public pushEvent(event: string, data?: any): void {
        this.eventEmitter.emit(event, data);
    }

    // ============================================
    // Component System
    // ============================================

    /**
     * Adds a generic component to this entity.
     * Takes the class reference as argument to properly instantiate it.
     */
    public addComponent<T extends Component>(ComponentClass: ComponentConstructor<T>): T {
        // Prevent adding multiple of the same component type
        if (this.components.has(ComponentClass)) {
            console.warn(`Component ${ComponentClass.name} already exists on entity ${this.GUID}`);
            return this.components.get(ComponentClass) as T;
        }

        const comp = new ComponentClass(this);
        this.components.set(ComponentClass, comp);

        if (comp.onAdd) {
            comp.onAdd();
        }

        return comp;
    }

    public setBrain(brain: Brain): void {
        if (this.brain) {
            this.brain.stop();
        }
        this.brain = brain;
        brain.inst = this;
        brain.start();
    }

    public setStateGraph(sg: StateGraph): void {
        if (this.sg) {
            this.sg.stop();
        }
        this.sg = sg;
        sg.inst = this;
        sg.start();
    }

    /**
     * Removes a component by its class.
     */
    public removeComponent<T extends Component>(ComponentClass: ComponentConstructor<T>): void {
        const comp = this.components.get(ComponentClass);
        if (comp) {
            this.stopUpdatingComponent(comp);
            if (comp.onRemove) {
                comp.onRemove();
            }
            this.components.delete(ComponentClass);
        }
    }

    /**
     * Gets a component by its class. Returns undefined if not found.
     */
    public getComponent<T extends Component>(ComponentClass: ComponentConstructor<T>): T | undefined {
        return this.components.get(ComponentClass) as T;
    }

    /**
     * Convenience wrapper around getComponent but throws if not found
     */
    public requireComponent<T extends Component>(ComponentClass: ComponentConstructor<T>): T {
        const comp = this.getComponent(ComponentClass);
        if (!comp) {
            throw new Error(`Entity ${this.GUID} requires component ${ComponentClass.name} but it is missing.`);
        }
        return comp;
    }

    // ============================================
    // Update System
    // ============================================

    /**
     * Instead of all components automatically updating,
     * they must explicitly be registered to update to save performance.
     */
    public startUpdatingComponent(comp: Component): void {
        if (this.components.has(comp.constructor as Function)) {
            this.updateComponents.add(comp);
        }
    }

    public stopUpdatingComponent(comp: Component): void {
        this.updateComponents.delete(comp);
    }

    /**
     * Update loop to be called by the game engine.
     * Ticks only components that requested it.
     */
    public update(dt: number): void {
        for (const comp of this.updateComponents) {
            if (comp.update) {
                comp.update(dt);
            }
        }
    }

    public facePoint(x: number, z: number): void {
        this.getComponent(Transform)?.facePoint(x, z);
    }

    // ============================================
    // Lifecycle
    // ============================================

    public remove(): void {
        if (!this.isValid) {
            return;
        }

        this.isValid = false;

        // Notify others
        this.pushEvent("onremove");

        if (this.brain) {
            this.brain.stop();
            this.brain = null;
        }

        if (this.sg) {
            this.sg.stop();
            this.sg = null;
        }

        // Cleanup components
        for (const [_, comp] of this.components) {
            if (comp.onRemove) {
                comp.onRemove();
            }
        }

        this.components.clear();
        this.updateComponents.clear();
        this.tags = 0;
        this.eventEmitter.removeAllListeners();
    }
}
