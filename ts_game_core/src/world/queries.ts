import { Entity } from "../core/Entity";
import { Transform } from "../components/Transform";

export function findClosestEntity(
    inst: Entity,
    radius: number,
    filter?: (entity: Entity) => boolean,
): Entity | null {
    return inst.world?.findClosestEntityFromInst(inst, radius, filter) ?? null;
}

export function isWalkable(inst: Entity, x: number, z: number): boolean {
    return inst.world?.isWalkable(x, z, inst.map) ?? true;
}

export function findWalkableOffset(
    inst: Entity,
    angleRad: number,
    distance: number,
    attempts: number = 8,
): { x: number; z: number } | null {
    const transform = inst.getComponent(Transform);
    if (!transform) {
        return null;
    }

    return inst.world?.findWalkableOffset(
        { x: transform.x, z: transform.z },
        angleRad,
        distance,
        attempts,
        inst.map,
    ) ?? null;
}
