import { EventEmitter, EventHandler } from './EventEmitter';
import { Component } from "./Component";
import { TagQuery, hasAllTags, hasAnyTag } from "./Tags";
import type { Brain } from "./behavior/Brain";
import type { StateGraph } from "./stategraph/StateGraph";
import { Transform } from "../components/Transform";
import type { World } from "../world/World";
import type { MapContext } from "../world/MapContext";
import type { EntityPhysics } from "../physics/game/EntityPhysics";

// Utility type to define the constructor of a Component class
export type ComponentConstructor<T extends Component> = new (inst: Entity) => T;

export interface EntitySaveData {
    prefabId: string | null;
    prefabName: string;
    mapId: string | null;
    tags: string[];
    components: Record<string, unknown>;
}

export class Entity {
    private static nextId: number = 1;

    public readonly GUID: number;
    public prefabId: string | null = null;
    public prefabName: string = "Unnamed";
    public isValid: boolean = true;

    // Core systems
    private components: Map<Function, Component> = new Map();
    private updateComponents: Set<Component> = new Set();

    // Native sub-systems
    public brain: Brain | null = null;
    public sg: StateGraph | null = null;
    public world: World | null = null;
    public map: MapContext | null = null;
    public physics: EntityPhysics | null = null;
    private tags: Set<string> = new Set();
    private eventEmitter: EventEmitter = new EventEmitter();

    constructor() {
        this.GUID = Entity.nextId++;
    }

    // ============================================
    // Tag System
    // ============================================

    public addTag(tags: TagQuery): void {
        const values = Array.isArray(tags) ? tags : [tags];
        for (const tag of values) {
            this.tags.add(tag);
        }
    }

    public removeTag(tags: TagQuery): void {
        const values = Array.isArray(tags) ? tags : [tags];
        for (const tag of values) {
            this.tags.delete(tag);
        }
    }

    public hasTag(tags: TagQuery): boolean {
        return hasAnyTag(this.tags, tags);
    }

    public hasAllTags(tags: TagQuery): boolean {
        return hasAllTags(this.tags, tags);
    }

    public hasAnyTag(tags: TagQuery): boolean {
        return hasAnyTag(this.tags, tags);
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

    public setWorld(world: World | null): void {
        this.world = world;
    }

    public setPrefabId(prefabId: string | null): void {
        this.prefabId = prefabId;
    }

    public setMap(map: MapContext | null): void {
        this.map = map;
    }

    public setPhysics(physics: EntityPhysics | null): void {
        this.physics = physics;
    }

    public serialize(): EntitySaveData {
        const components: Record<string, unknown> = {};
        for (const component of this.components.values()) {
            if (!component.serialize) {
                continue;
            }
            components[component.constructor.name] = component.serialize();
        }

        return {
            prefabId: this.prefabId,
            prefabName: this.prefabName,
            mapId: this.map?.id ?? null,
            tags: Array.from(this.tags),
            components,
        };
    }

    public deserialize(data: EntitySaveData): void {
        this.prefabId = data.prefabId;
        this.prefabName = data.prefabName;
        this.tags = new Set(data.tags);

        for (const component of this.components.values()) {
            const componentData = data.components[component.constructor.name];
            if (component.deserialize && componentData !== undefined) {
                component.deserialize(componentData);
            }
        }
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

        this.physics = null;
        this.map = null;
        this.world = null;
        this.prefabId = null;

        // Cleanup components
        for (const [_, comp] of this.components) {
            if (comp.onRemove) {
                comp.onRemove();
            }
        }

        this.components.clear();
        this.updateComponents.clear();
        this.tags.clear();
        this.eventEmitter.removeAllListeners();
    }
}
