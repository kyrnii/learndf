import { GridPoint, TerrainMap } from "./TerrainMap";

export interface FootprintRect {
    cellX: number;
    cellZ: number;
    width: number;
    height: number;
}

export interface OccupancyMapSaveData {
    footprints: Array<{
        id: string;
        cellX: number;
        cellZ: number;
        width: number;
        height: number;
    }>;
}

// 占用层：保存放置物和建筑 footprint，占用是放置合法性的真相源。
export class OccupancyMap {
    private occupiedByCell: Map<string, string> = new Map();
    private footprintsById: Map<string, FootprintRect> = new Map();

    constructor(private readonly terrain: TerrainMap) {}

    private toCellKey(cellX: number, cellZ: number): string {
        return `${cellX},${cellZ}`;
    }

    public worldToCell(x: number, z: number): GridPoint {
        return this.terrain.worldToCell(x, z);
    }

    public cellToWorld(cellX: number, cellZ: number): GridPoint {
        return this.terrain.cellToWorld(cellX, cellZ);
    }

    public isCellOccupied(cellX: number, cellZ: number): boolean {
        return this.occupiedByCell.has(this.toCellKey(cellX, cellZ));
    }

    public isOccupiedWorld(x: number, z: number): boolean {
        const cell = this.worldToCell(x, z);
        return this.isCellOccupied(cell.x, cell.z);
    }

    public canPlaceRect(cellX: number, cellZ: number, width: number, height: number): boolean {
        for (let z = cellZ; z < cellZ + height; z++) {
            for (let x = cellX; x < cellX + width; x++) {
                const world = this.cellToWorld(x, z);
                if (!this.terrain.isPlaceable(world.x, world.z) || this.isCellOccupied(x, z)) {
                    return false;
                }
            }
        }

        return true;
    }

    public placeRect(id: string, cellX: number, cellZ: number, width: number, height: number): boolean {
        if (!this.canPlaceRect(cellX, cellZ, width, height)) {
            return false;
        }

        this.remove(id);
        for (let z = cellZ; z < cellZ + height; z++) {
            for (let x = cellX; x < cellX + width; x++) {
                this.occupiedByCell.set(this.toCellKey(x, z), id);
            }
        }

        this.footprintsById.set(id, { cellX, cellZ, width, height });
        return true;
    }

    public remove(id: string): void {
        const footprint = this.footprintsById.get(id);
        if (!footprint) {
            return;
        }

        for (let z = footprint.cellZ; z < footprint.cellZ + footprint.height; z++) {
            for (let x = footprint.cellX; x < footprint.cellX + footprint.width; x++) {
                this.occupiedByCell.delete(this.toCellKey(x, z));
            }
        }

        this.footprintsById.delete(id);
    }

    public getFootprint(id: string): FootprintRect | null {
        return this.footprintsById.get(id) ?? null;
    }

    public getAllFootprints(): Array<{ id: string; footprint: FootprintRect }> {
        return Array.from(this.footprintsById.entries()).map(([id, footprint]) => ({
            id,
            footprint: { ...footprint },
        }));
    }

    public serialize(): OccupancyMapSaveData {
        return {
            footprints: Array.from(this.footprintsById.entries()).map(([id, footprint]) => ({
                id,
                cellX: footprint.cellX,
                cellZ: footprint.cellZ,
                width: footprint.width,
                height: footprint.height,
            })),
        };
    }

    public deserialize(data: OccupancyMapSaveData): void {
        this.occupiedByCell.clear();
        this.footprintsById.clear();

        for (const footprint of data.footprints) {
            this.placeRect(
                footprint.id,
                footprint.cellX,
                footprint.cellZ,
                footprint.width,
                footprint.height,
            );
        }
    }
}
