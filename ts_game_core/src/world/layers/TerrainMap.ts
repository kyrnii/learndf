export interface GridPoint {
    x: number;
    z: number;
}

export interface MapBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface TerrainMapSaveData {
    cellSize: number;
    bounds: MapBounds;
    blockedCells: string[];
}

// 地形层：保存边界、格子尺寸和天然不可走区域。
export class TerrainMap {
    private blockedCells: Set<string> = new Set();

    constructor(
        public readonly cellSize: number = 1,
        public readonly bounds: MapBounds = {
            minX: -Infinity,
            maxX: Infinity,
            minZ: -Infinity,
            maxZ: Infinity,
        },
    ) {}

    private toCellKey(cellX: number, cellZ: number): string {
        return `${cellX},${cellZ}`;
    }

    public worldToCell(x: number, z: number): GridPoint {
        return {
            x: Math.floor(x / this.cellSize),
            z: Math.floor(z / this.cellSize),
        };
    }

    public cellToWorld(cellX: number, cellZ: number): GridPoint {
        return {
            x: (cellX + 0.5) * this.cellSize,
            z: (cellZ + 0.5) * this.cellSize,
        };
    }

    public setBlockedWorld(x: number, z: number, blocked: boolean = true): void {
        const cell = this.worldToCell(x, z);
        this.setBlockedCell(cell.x, cell.z, blocked);
    }

    public setBlockedCell(cellX: number, cellZ: number, blocked: boolean = true): void {
        const key = this.toCellKey(cellX, cellZ);
        if (blocked) {
            this.blockedCells.add(key);
        } else {
            this.blockedCells.delete(key);
        }
    }

    public isBlockedCell(cellX: number, cellZ: number): boolean {
        return this.blockedCells.has(this.toCellKey(cellX, cellZ));
    }

    public isWalkable(x: number, z: number): boolean {
        if (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ) {
            return false;
        }

        const cell = this.worldToCell(x, z);
        return !this.isBlockedCell(cell.x, cell.z);
    }

    public isPlaceable(x: number, z: number): boolean {
        return this.isWalkable(x, z);
    }

    public serialize(): TerrainMapSaveData {
        return {
            cellSize: this.cellSize,
            bounds: { ...this.bounds },
            blockedCells: Array.from(this.blockedCells),
        };
    }

    public deserialize(data: TerrainMapSaveData): void {
        this.blockedCells.clear();
        for (const key of data.blockedCells) {
            this.blockedCells.add(key);
        }
    }
}
