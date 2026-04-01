import { Entity } from "../core/Entity";
import { MapContext } from "./MapContext";
import type { World } from "./World";

export interface PlacementFootprint {
    width: number;
    height: number;
}

export type PlacementRotation = 0 | 90 | 180 | 270;

export interface PlacementOptions {
    id: string;
    x: number;
    z: number;
    footprint?: PlacementFootprint;
    rotation?: PlacementRotation;
    entity?: Entity;
    map?: MapContext | string | null;
    createPhysicsObstacle?: boolean;
    blockTerrainCell?: boolean;
}

export interface RemovePlacementOptions {
    id?: string;
    x?: number;
    z?: number;
    entity?: Entity;
    map?: MapContext | string | null;
    clearTerrainCell?: boolean;
}

export interface PlacementPreview {
    map: MapContext;
    cellX: number;
    cellZ: number;
    snappedX: number;
    snappedZ: number;
    centerX: number;
    centerZ: number;
    rotation: PlacementRotation;
    footprint: PlacementFootprint;
    canPlace: boolean;
}

// 放置系统：负责放置合法性、占用写入，以及按需同步到 physics。
export class PlacementSystem {
    constructor(private readonly world: World) {}

    public preview(options: PlacementOptions): PlacementPreview {
        const map = this.world.resolveMap(options.map ?? options.entity?.map ?? null);
        const cell = map.terrain.worldToCell(options.x, options.z);
        const rotation = this.normalizeRotation(options.rotation);
        const footprint = this.rotateFootprint(options.footprint ?? { width: 1, height: 1 }, rotation);
        const snapped = map.terrain.cellToWorld(cell.x, cell.z);
        const center = this.getPlacementCenter(map, cell.x, cell.z, footprint);

        return {
            map,
            cellX: cell.x,
            cellZ: cell.z,
            snappedX: snapped.x,
            snappedZ: snapped.z,
            centerX: center.x,
            centerZ: center.z,
            rotation,
            footprint,
            canPlace: map.canPlaceRect(cell.x, cell.z, footprint.width, footprint.height),
        };
    }

    public canPlace(options: PlacementOptions): boolean {
        return this.preview(options).canPlace;
    }

    public place(options: PlacementOptions): boolean {
        const preview = this.preview(options);
        if (!preview.canPlace) {
            return false;
        }

        if (!preview.map.placeRect(options.id, preview.cellX, preview.cellZ, preview.footprint.width, preview.footprint.height)) {
            return false;
        }

        if (options.blockTerrainCell !== false) {
            for (let z = preview.cellZ; z < preview.cellZ + preview.footprint.height; z++) {
                for (let x = preview.cellX; x < preview.cellX + preview.footprint.width; x++) {
                    const worldPoint = preview.map.terrain.cellToWorld(x, z);
                    preview.map.setTerrainBlockedWorld(worldPoint.x, worldPoint.z, true);
                }
            }
        }

        preview.map.staticPhysics.setPlacementEnabled(options.id, options.createPhysicsObstacle !== false);

        return true;
    }

    public remove(options: RemovePlacementOptions): void {
        const map = this.world.resolveMap(options.map ?? options.entity?.map ?? null);
        const placementId = options.id ?? options.entity?.GUID.toString();

        if (placementId) {
            map.staticPhysics.removePlacement(placementId);
            const footprint = map.occupancy.getFootprint(placementId);
            map.removeRect(placementId);

            if (options.clearTerrainCell !== false && footprint) {
                for (let z = footprint.cellZ; z < footprint.cellZ + footprint.height; z++) {
                    for (let x = footprint.cellX; x < footprint.cellX + footprint.width; x++) {
                        const worldPoint = map.terrain.cellToWorld(x, z);
                        map.setTerrainBlockedWorld(worldPoint.x, worldPoint.z, false);
                    }
                }
            }
        } else if (options.clearTerrainCell !== false && options.x !== undefined && options.z !== undefined) {
            map.setTerrainBlockedWorld(options.x, options.z, false);
        }

    }

    private normalizeRotation(rotation: PlacementRotation | undefined): PlacementRotation {
        switch (rotation) {
            case 90:
            case 180:
            case 270:
                return rotation;
            default:
                return 0;
        }
    }

    private rotateFootprint(footprint: PlacementFootprint, rotation: PlacementRotation): PlacementFootprint {
        if (rotation === 90 || rotation === 270) {
            return {
                width: footprint.height,
                height: footprint.width,
            };
        }

        return { ...footprint };
    }

    private getPlacementCenter(
        map: MapContext,
        cellX: number,
        cellZ: number,
        footprint: PlacementFootprint,
    ): { x: number; z: number } {
        return {
            x: (cellX + footprint.width * 0.5) * map.cellSize,
            z: (cellZ + footprint.height * 0.5) * map.cellSize,
        };
    }
}
