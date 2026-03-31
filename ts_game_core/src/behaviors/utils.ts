import { Entity } from "../core/Entity";
import { Transform } from "../components/Transform";

export type ValueOrFn<T> = T | ((inst: Entity) => T);

export function resolveValue<T>(value: ValueOrFn<T>, inst: Entity): T {
    return typeof value === "function"
        ? (value as (inst: Entity) => T)(inst)
        : value;
}

export function isAliveEntity(target: Entity | null | undefined): target is Entity {
    return !!target && target.isValid;
}

export function getTargetPosition(target: Entity): { x: number; z: number } | null {
    const transform = target.getComponent(Transform);
    if (!transform) {
        return null;
    }

    return { x: transform.x, z: transform.z };
}

export function getDistanceSq(inst: Entity, target: Entity): number | null {
    const selfTransform = inst.getComponent(Transform);
    const targetTransform = target.getComponent(Transform);
    if (!selfTransform || !targetTransform) {
        return null;
    }

    return selfTransform.getDistanceSqToPoint(targetTransform.x, targetTransform.z);
}
