import { Entity } from './Entity';

/**
 * Base Component class. All entity components should extend this.
 */
export abstract class Component {
    public readonly inst: Entity;

    constructor(entity: Entity) {
        this.inst = entity;
    }

    /**
     * Called when the component is added to an entity
     */
    public onAdd?(): void;

    /**
     * Called when the component is removed from an entity
     */
    public onRemove?(): void;

    /**
     * Optional update method if this component requires frame-by-frame updates
     * @param dt Delta time since last frame
     */
    public update?(dt: number): void;
}
