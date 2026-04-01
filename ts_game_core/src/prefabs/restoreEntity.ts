import { Entity, EntitySaveData } from "../core/Entity";
import { Transform } from "../components/Transform";
import { PrefabRegistry } from "./PrefabRegistry";
import { spawnPrefab } from "./spawnPrefab";
import { World } from "../world";

export interface RestoreEntityOptions {
    world?: World | null;
    mapId?: string | null;
}

export function restoreEntityFromSave(
    registry: PrefabRegistry,
    save: EntitySaveData,
    options: RestoreEntityOptions = {},
): Entity {
    const transformData = save.components.Transform as Partial<{
        x: number;
        y: number;
        z: number;
    }> | undefined;

    const entity = spawnPrefab(registry, save.prefabId ?? save.prefabName, {
        world: options.world ?? null,
        map: options.mapId ?? save.mapId ?? null,
        position: transformData
            ? {
                x: transformData.x ?? 0,
                y: transformData.y ?? 0,
                z: transformData.z ?? 0,
            }
            : undefined,
    });

    entity.deserialize(save);

    const transform = entity.getComponent(Transform);
    if (transformData && transform) {
        transform.deserialize(save.components.Transform);
    }

    return entity;
}
