import { PrefabRegistry, restoreEntityFromSave } from "../prefabs";
import { Physics } from "../physics";
import { MapContext } from "./MapContext";
import { TerrainMap } from "./layers";
import { World, WorldSaveData } from "./World";

export interface RestoreWorldOptions {
    physics?: Physics | null;
}

export function restoreWorldFromSave(
    registry: PrefabRegistry,
    save: WorldSaveData,
    options: RestoreWorldOptions = {},
): World {
    if (save.maps.length === 0) {
        throw new Error("World save data must contain at least one map.");
    }

    const [firstMapSave, ...otherMaps] = save.maps;
    const firstMap = new MapContext({
        id: firstMapSave.id,
        terrain: new TerrainMap(firstMapSave.terrain.cellSize, firstMapSave.terrain.bounds),
    });
    firstMap.deserialize(firstMapSave);

    const world = new World(firstMap);
    if (options.physics) {
        world.setPhysics(options.physics);
    }

    for (const mapSave of otherMaps) {
        const map = new MapContext({
            id: mapSave.id,
            terrain: new TerrainMap(mapSave.terrain.cellSize, mapSave.terrain.bounds),
        });
        map.deserialize(mapSave);
        world.addMap(map, { setDefault: map.id === save.defaultMapId });
    }

    world.brainManager.currentTime = save.brainTime;
    world.sgManager.currentTime = save.sgTime;

    for (const entitySave of save.entities) {
        restoreEntityFromSave(registry, entitySave, {
            world,
            mapId: entitySave.mapId,
        });
    }

    return world;
}
