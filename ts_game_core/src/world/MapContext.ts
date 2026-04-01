import { Physics } from "../physics";
import {
    FindPathOptions,
    MapBounds,
    NavAgentSize,
    NavMeshLayer,
    NavigationMap,
    OccupancyMap,
    OccupancyMapSaveData,
    StaticPhysicsLayer,
    TerrainMap,
    TerrainMapSaveData,
} from "./layers";

export interface MapContextOptions {
    id: string;
    cellSize?: number;
    bounds?: MapBounds;
    terrain?: TerrainMap;
    occupancy?: OccupancyMap;
    navigation?: NavigationMap;
    navMesh?: NavMeshLayer;
    staticPhysics?: StaticPhysicsLayer;
}

export interface MapContextSaveData {
    id: string;
    terrain: TerrainMapSaveData;
    occupancy: OccupancyMapSaveData;
}

// 地图实例：一张独立运行的子地图，可拥有不同格子尺寸、导航和可选物理。
export class MapContext {
    public readonly id: string;
    public readonly terrain: TerrainMap;
    public readonly occupancy: OccupancyMap;
    public readonly navigation: NavigationMap;
    public readonly navMesh: NavMeshLayer;
    public readonly staticPhysics: StaticPhysicsLayer;
    public physics: Physics | null = null;

    constructor(options: MapContextOptions) {
        this.id = options.id;
        this.terrain = options.terrain ?? new TerrainMap(options.cellSize, options.bounds);
        this.occupancy = options.occupancy ?? new OccupancyMap(this.terrain);
        this.navigation = options.navigation ?? new NavigationMap(this.terrain, this.occupancy);
        this.navMesh = options.navMesh ?? new NavMeshLayer(this.terrain, this.occupancy);
        this.staticPhysics = options.staticPhysics ?? new StaticPhysicsLayer(this.occupancy, this.terrain.cellSize);
    }

    public get cellSize(): number {
        return this.terrain.cellSize;
    }

    public get bounds(): MapBounds {
        return this.terrain.bounds;
    }

    public setPhysics(physics: Physics | null): void {
        this.physics = physics;
        this.staticPhysics.setPhysics(physics);
    }

    public flushLayers(): void {
        this.staticPhysics.flush();
    }

    public isWalkable(x: number, z: number): boolean {
        return this.navigation.isWalkable(x, z);
    }

    public isWalkableForAgent(x: number, z: number, agentSize: NavAgentSize = "small"): boolean {
        return this.navigation.isWalkable(x, z, agentSize);
    }

    public isPathClear(
        from: { x: number; z: number },
        to: { x: number; z: number },
        agentSize: NavAgentSize = "small",
    ): boolean {
        return this.navigation.isPathWalkable(from, to, agentSize);
    }

    public findWalkableOffset(
        origin: { x: number; z: number },
        angleRad: number,
        distance: number,
        attempts: number = 8,
        agentSize: NavAgentSize = "small",
    ): { x: number; z: number } | null {
        return this.navigation.findNearbyWalkableOffset(origin, angleRad, distance, attempts, agentSize);
    }

    public findDetourPoint(
        from: { x: number; z: number },
        to: { x: number; z: number },
        searchDistance?: number,
        agentSize: NavAgentSize = "small",
    ): { x: number; z: number } | null {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const dist = Math.sqrt((dx * dx) + (dz * dz));
        const detourDistance = searchDistance ?? Math.max(this.cellSize * 2, Math.min(dist, this.cellSize * 4));
        return this.navigation.findSimpleDetour(from, to, detourDistance, agentSize);
    }

    public findPath(
        from: { x: number; z: number },
        to: { x: number; z: number },
        options?: FindPathOptions,
    ): Array<{ x: number; z: number }> | null {
        const navMeshPath = this.navMesh.findPath(from, to, {
            maxVisitedRegions: options?.maxVisitedNodes,
            agentSize: options?.agentSize,
        });
        if (navMeshPath && navMeshPath.length > 0) {
            return navMeshPath;
        }

        return this.navigation.findPath(from, to, options);
    }

    public setTerrainBlockedWorld(x: number, z: number, blocked: boolean = true): void {
        const cell = this.terrain.worldToCell(x, z);
        this.terrain.setBlockedCell(cell.x, cell.z, blocked);
        this.navigation.invalidateCell(cell.x, cell.z);
        this.navMesh.markDirtyRect(cell.x, cell.z, 1, 1);
    }

    public placeRect(id: string, cellX: number, cellZ: number, width: number, height: number): boolean {
        const success = this.occupancy.placeRect(id, cellX, cellZ, width, height);
        if (success) {
            this.navigation.invalidateRect(cellX, cellZ, width, height);
            this.navMesh.markDirtyRect(cellX, cellZ, width, height);
            this.staticPhysics.markDirty();
        }
        return success;
    }

    public removeRect(id: string): void {
        const footprint = this.occupancy.getFootprint(id);
        this.occupancy.remove(id);
        if (footprint) {
            this.navigation.invalidateRect(footprint.cellX, footprint.cellZ, footprint.width, footprint.height);
            this.navMesh.markDirtyRect(footprint.cellX, footprint.cellZ, footprint.width, footprint.height);
            this.staticPhysics.markDirty();
        }
    }

    public canPlaceRect(cellX: number, cellZ: number, width: number, height: number): boolean {
        return this.occupancy.canPlaceRect(cellX, cellZ, width, height);
    }

    public serialize(): MapContextSaveData {
        return {
            id: this.id,
            terrain: this.terrain.serialize(),
            occupancy: this.occupancy.serialize(),
        };
    }

    public deserialize(data: MapContextSaveData): void {
        this.terrain.deserialize(data.terrain);
        this.occupancy.deserialize(data.occupancy);

        for (const footprint of data.occupancy.footprints) {
            this.navigation.invalidateRect(
                footprint.cellX,
                footprint.cellZ,
                footprint.width,
                footprint.height,
            );
        }
        this.navMesh.markDirty();
        this.staticPhysics.markDirty();
    }
}
