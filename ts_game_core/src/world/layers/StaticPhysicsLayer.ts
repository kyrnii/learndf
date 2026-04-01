import { PhysicsBody } from "../../physics/core/PhysicsBody";
import type { Physics } from "../../physics/game/Physics";
import { OccupancyMap } from "./OccupancyMap";

interface PlacementPhysicsOptions {
    enabled: boolean;
}

interface MergedRect {
    cellX: number;
    cellZ: number;
    width: number;
    height: number;
}

// 静态物理层：从占用图派生静态障碍，可统一开关、延迟刷新和合并相邻矩形。
export class StaticPhysicsLayer {
    private physics: Physics | null = null;
    private enabled: boolean = true;
    private dirty: boolean = true;
    private readonly placementOptions: Map<string, PlacementPhysicsOptions> = new Map();
    private readonly bodies: PhysicsBody[] = [];

    constructor(
        private readonly occupancy: OccupancyMap,
        private readonly cellSize: number,
    ) {}

    public setPhysics(physics: Physics | null): void {
        if (this.physics === physics) {
            return;
        }

        this.clearBodies();
        this.physics = physics;
        this.dirty = true;
    }

    public setEnabled(enabled: boolean): void {
        if (this.enabled === enabled) {
            return;
        }

        this.enabled = enabled;
        this.dirty = true;
        if (!enabled) {
            this.clearBodies();
        }
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public setPlacementEnabled(id: string, enabled: boolean): void {
        this.placementOptions.set(id, { enabled });
        this.dirty = true;
    }

    public removePlacement(id: string): void {
        this.placementOptions.delete(id);
        this.dirty = true;
    }

    public markDirty(): void {
        this.dirty = true;
    }

    public flush(): void {
        if (!this.dirty) {
            return;
        }

        this.clearBodies();
        this.dirty = false;

        if (!this.physics || !this.enabled) {
            return;
        }

        for (const rect of this.buildMergedRects()) {
            const worldWidth = rect.width * this.cellSize;
            const worldHeight = rect.height * this.cellSize;
            const centerX = (rect.cellX + rect.width * 0.5) * this.cellSize;
            const centerZ = (rect.cellZ + rect.height * 0.5) * this.cellSize;

            const body = this.physics.addObstacle({
                transform: {
                    position: {
                        x: centerX,
                        y: 0,
                        z: centerZ,
                    },
                },
                shape: {
                    type: "box",
                    halfExtents: {
                        x: worldWidth * 0.5,
                        y: 0.5,
                        z: worldHeight * 0.5,
                    },
                },
                userData: {
                    type: "static_map_obstacle",
                    rect,
                },
            });

            this.bodies.push(body);
        }
    }

    public getDebugMergedRects(): Array<{ cellX: number; cellZ: number; width: number; height: number }> {
        return this.buildMergedRects().map((rect) => ({ ...rect }));
    }

    private clearBodies(): void {
        if (!this.physics) {
            this.bodies.length = 0;
            return;
        }

        while (this.bodies.length > 0) {
            const body = this.bodies.pop();
            if (!body) {
                continue;
            }
            this.physics.destroyBody(body);
        }
    }

    private buildMergedRects(): MergedRect[] {
        const occupied: Set<string> = new Set();

        for (const { id, footprint } of this.occupancy.getAllFootprints()) {
            const placementEnabled = this.placementOptions.get(id)?.enabled ?? true;
            if (!placementEnabled) {
                continue;
            }

            for (let z = footprint.cellZ; z < footprint.cellZ + footprint.height; z++) {
                for (let x = footprint.cellX; x < footprint.cellX + footprint.width; x++) {
                    occupied.add(`${x},${z}`);
                }
            }
        }

        const rects: MergedRect[] = [];

        while (occupied.size > 0) {
            const firstKey = Array.from(occupied).sort(this.compareCellKeys)[0];
            const { cellX, cellZ } = this.parseCellKey(firstKey);
            let width = 1;
            let height = 1;

            while (occupied.has(`${cellX + width},${cellZ}`)) {
                width++;
            }

            let canExtend = true;
            while (canExtend) {
                const nextZ = cellZ + height;
                for (let x = cellX; x < cellX + width; x++) {
                    if (!occupied.has(`${x},${nextZ}`)) {
                        canExtend = false;
                        break;
                    }
                }
                if (canExtend) {
                    height++;
                }
            }

            for (let z = cellZ; z < cellZ + height; z++) {
                for (let x = cellX; x < cellX + width; x++) {
                    occupied.delete(`${x},${z}`);
                }
            }

            rects.push({ cellX, cellZ, width, height });
        }

        return rects;
    }

    private compareCellKeys = (left: string, right: string): number => {
        const a = this.parseCellKey(left);
        const b = this.parseCellKey(right);
        if (a.cellZ !== b.cellZ) {
            return a.cellZ - b.cellZ;
        }
        return a.cellX - b.cellX;
    };

    private parseCellKey(key: string): { cellX: number; cellZ: number } {
        const [cellX, cellZ] = key.split(",").map(Number);
        return { cellX, cellZ };
    }
}
