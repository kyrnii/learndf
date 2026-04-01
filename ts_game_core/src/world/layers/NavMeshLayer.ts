import { getNavAgentClearanceCells, NavAgentSize, NAV_AGENT_CLEARANCE_CELLS } from "./NavAgent";
import { OccupancyMap } from "./OccupancyMap";
import { GridPoint, TerrainMap } from "./TerrainMap";

export interface NavMeshFindPathOptions {
    maxVisitedRegions?: number;
    agentSize?: NavAgentSize;
}

export interface NavMeshRegion {
    id: string;
    cellX: number;
    cellZ: number;
    width: number;
    height: number;
}

export interface NavMeshPortal {
    fromRegionId: string;
    toRegionId: string;
    start: GridPoint;
    end: GridPoint;
}

export interface NavMeshDebugSnapshot {
    regions: NavMeshRegion[];
    portals: NavMeshPortal[];
}

interface RegionNode {
    id: string;
    g: number;
    h: number;
    f: number;
    parentId: string | null;
}

interface DirtyRect {
    minCellX: number;
    maxCellX: number;
    minCellZ: number;
    maxCellZ: number;
}

interface NavMeshChunk {
    chunkX: number;
    chunkZ: number;
    regions: NavMeshRegion[];
}

interface NavMeshCache {
    chunks: Map<string, NavMeshChunk>;
    regions: NavMeshRegion[];
    regionById: Map<string, NavMeshRegion>;
    adjacency: Map<string, string[]>;
    portals: Map<string, NavMeshPortal>;
    fullDirty: boolean;
    dirtyChunkKeys: Set<string>;
}

// NavMesh 层：按不同体型缓存分块矩形区域图，只在查询时懒生成并局部重建脏块。
export class NavMeshLayer {
    private enabled = true;
    private readonly cachesByClearance: Map<number, NavMeshCache> = new Map();
    private readonly chunkSizeCells = 16;
    private readonly maxClearanceCells = Math.max(...Object.values(NAV_AGENT_CLEARANCE_CELLS));

    constructor(
        private readonly terrain: TerrainMap,
        private readonly occupancy: OccupancyMap,
    ) {}

    public setEnabled(enabled: boolean): void {
        if (this.enabled === enabled) {
            return;
        }

        this.enabled = enabled;
        if (!enabled) {
            this.cachesByClearance.clear();
            return;
        }

        this.markDirty();
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public markDirty(): void {
        for (const cache of this.cachesByClearance.values()) {
            cache.fullDirty = true;
            cache.dirtyChunkKeys.clear();
        }
    }

    public markDirtyRect(cellX: number, cellZ: number, width: number, height: number): void {
        if (this.cachesByClearance.size === 0) {
            return;
        }

        const rect = this.expandDirtyRect({
            minCellX: cellX,
            maxCellX: cellX + Math.max(0, width - 1),
            minCellZ: cellZ,
            maxCellZ: cellZ + Math.max(0, height - 1),
        });

        const minChunk = this.worldCellToChunk(rect.minCellX, rect.minCellZ);
        const maxChunk = this.worldCellToChunk(rect.maxCellX, rect.maxCellZ);

        for (const cache of this.cachesByClearance.values()) {
            if (cache.fullDirty) {
                continue;
            }

            for (let chunkZ = minChunk.chunkZ; chunkZ <= maxChunk.chunkZ; chunkZ++) {
                for (let chunkX = minChunk.chunkX; chunkX <= maxChunk.chunkX; chunkX++) {
                    cache.dirtyChunkKeys.add(this.toChunkKey(chunkX, chunkZ));
                }
            }
        }
    }

    public flush(): void {
        // 导航层不在 world.update 中主动刷新，保留空接口以兼容现有调用。
    }

    public findPath(
        from: GridPoint,
        to: GridPoint,
        options: NavMeshFindPathOptions = {},
    ): GridPoint[] | null {
        if (!this.enabled) {
            return null;
        }

        const clearanceCells = getNavAgentClearanceCells(options.agentSize ?? "small");
        const cache = this.getOrBuildCache(clearanceCells);
        if (!cache || cache.regions.length === 0) {
            return null;
        }

        const startRegion = this.findRegionAt(cache.regions, from.x, from.z);
        const goalRegion = this.findRegionAt(cache.regions, to.x, to.z);
        if (!startRegion || !goalRegion) {
            return null;
        }

        if (startRegion.id === goalRegion.id) {
            return [to];
        }

        const regionPath = this.findRegionPath(cache, startRegion.id, goalRegion.id, options);
        if (!regionPath || regionPath.length === 0) {
            return null;
        }

        const portals: NavMeshPortal[] = [];
        for (let i = 0; i < regionPath.length - 1; i++) {
            const portal = cache.portals.get(this.toPortalKey(regionPath[i], regionPath[i + 1]));
            if (!portal) {
                return null;
            }
            portals.push(portal);
        }

        const midpointPath = portals.map((portal) => this.getPortalMidpoint(portal)).concat([{ ...to }]);
        const midpointSmoothedPath = this.smoothPath(from, midpointPath, clearanceCells);

        const pulledPath = this.stringPullPortals(from, to, portals, cache);
        const pulledSmoothedPath = this.smoothPath(from, pulledPath, clearanceCells);

        const midpointValid = this.validatePathSegments(from, midpointSmoothedPath, clearanceCells);
        const pulledValid = this.validatePathSegments(from, pulledSmoothedPath, clearanceCells);

        if (!pulledValid) {
            return midpointValid ? midpointSmoothedPath : null;
        }

        if (!midpointValid) {
            return pulledSmoothedPath;
        }

        return this.measurePathLength(from, pulledSmoothedPath) <= this.measurePathLength(from, midpointSmoothedPath)
            ? pulledSmoothedPath
            : midpointSmoothedPath;
    }

    public getDebugSnapshot(agentSize: NavAgentSize = "small"): NavMeshDebugSnapshot | null {
        if (!this.enabled) {
            return null;
        }

        const clearanceCells = getNavAgentClearanceCells(agentSize);
        const cache = this.getOrBuildCache(clearanceCells);
        if (!cache) {
            return null;
        }

        return {
            regions: cache.regions.map((region) => ({ ...region })),
            portals: Array.from(cache.portals.values())
                .filter((portal) => portal.fromRegionId < portal.toRegionId)
                .map((portal) => ({
                    fromRegionId: portal.fromRegionId,
                    toRegionId: portal.toRegionId,
                    start: { ...portal.start },
                    end: { ...portal.end },
                })),
        };
    }

    private getOrBuildCache(clearanceCells: number): NavMeshCache | null {
        if (!this.hasFiniteBounds()) {
            return null;
        }

        let cache = this.cachesByClearance.get(clearanceCells);
        if (!cache) {
            cache = {
                chunks: new Map(),
                regions: [],
                regionById: new Map(),
                adjacency: new Map(),
                portals: new Map(),
                fullDirty: true,
                dirtyChunkKeys: new Set(),
            };
            this.cachesByClearance.set(clearanceCells, cache);
        }

        this.ensureCacheFresh(cache, clearanceCells);
        return cache;
    }

    private ensureCacheFresh(cache: NavMeshCache, clearanceCells: number): void {
        if (!cache.fullDirty && cache.dirtyChunkKeys.size === 0) {
            return;
        }

        if (cache.fullDirty) {
            this.rebuildAllChunks(cache, clearanceCells);
            cache.fullDirty = false;
            cache.dirtyChunkKeys.clear();
            return;
        }

        for (const chunkKey of cache.dirtyChunkKeys) {
            const { chunkX, chunkZ } = this.parseChunkKey(chunkKey);
            const chunk = this.buildChunk(chunkX, chunkZ, clearanceCells);
            if (chunk.regions.length > 0) {
                cache.chunks.set(chunkKey, chunk);
            } else {
                cache.chunks.delete(chunkKey);
            }
        }

        cache.dirtyChunkKeys.clear();
        this.rebuildGraph(cache);
    }

    private rebuildAllChunks(cache: NavMeshCache, clearanceCells: number): void {
        cache.chunks.clear();
        const chunkBounds = this.getChunkBounds();

        for (let chunkZ = chunkBounds.minChunkZ; chunkZ <= chunkBounds.maxChunkZ; chunkZ++) {
            for (let chunkX = chunkBounds.minChunkX; chunkX <= chunkBounds.maxChunkX; chunkX++) {
                const chunk = this.buildChunk(chunkX, chunkZ, clearanceCells);
                if (chunk.regions.length > 0) {
                    cache.chunks.set(this.toChunkKey(chunkX, chunkZ), chunk);
                }
            }
        }

        this.rebuildGraph(cache);
    }

    private rebuildGraph(cache: NavMeshCache): void {
        cache.regions = [];
        cache.regionById.clear();
        cache.adjacency.clear();
        cache.portals.clear();

        const orderedChunks = Array.from(cache.chunks.values()).sort((left, right) => {
            if (left.chunkZ !== right.chunkZ) {
                return left.chunkZ - right.chunkZ;
            }
            return left.chunkX - right.chunkX;
        });

        for (const chunk of orderedChunks) {
            for (const region of chunk.regions) {
                cache.regions.push(region);
                cache.regionById.set(region.id, region);
                cache.adjacency.set(region.id, []);
            }
        }

        for (const chunk of orderedChunks) {
            this.connectChunkRegions(cache, chunk.regions, chunk.regions);

            const eastChunk = cache.chunks.get(this.toChunkKey(chunk.chunkX + 1, chunk.chunkZ));
            if (eastChunk) {
                this.connectChunkRegions(cache, chunk.regions, eastChunk.regions);
            }

            const southChunk = cache.chunks.get(this.toChunkKey(chunk.chunkX, chunk.chunkZ + 1));
            if (southChunk) {
                this.connectChunkRegions(cache, chunk.regions, southChunk.regions);
            }
        }
    }

    private connectChunkRegions(cache: NavMeshCache, leftRegions: NavMeshRegion[], rightRegions: NavMeshRegion[]): void {
        const sameArray = leftRegions === rightRegions;
        for (let i = 0; i < leftRegions.length; i++) {
            const startJ = sameArray ? i + 1 : 0;
            for (let j = startJ; j < rightRegions.length; j++) {
                const left = leftRegions[i];
                const right = rightRegions[j];
                const portal = this.buildPortal(left, right);
                if (!portal) {
                    continue;
                }

                cache.adjacency.get(left.id)?.push(right.id);
                cache.adjacency.get(right.id)?.push(left.id);
                cache.portals.set(this.toPortalKey(left.id, right.id), portal);
                cache.portals.set(this.toPortalKey(right.id, left.id), {
                    fromRegionId: portal.toRegionId,
                    toRegionId: portal.fromRegionId,
                    start: { ...portal.start },
                    end: { ...portal.end },
                });
            }
        }
    }

    private buildChunk(chunkX: number, chunkZ: number, clearanceCells: number): NavMeshChunk {
        const chunkRect = this.getChunkCellRect(chunkX, chunkZ);
        const walkable = this.buildWalkableCellSetInRect(chunkRect, clearanceCells);
        const regions = this.mergeWalkableCells(
            walkable,
            (regionIndex) => `region_${chunkX}_${chunkZ}_${regionIndex}`,
        );

        return {
            chunkX,
            chunkZ,
            regions,
        };
    }

    private hasFiniteBounds(): boolean {
        const { minX, maxX, minZ, maxZ } = this.terrain.bounds;
        return Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ);
    }

    private getChunkBounds(): { minChunkX: number; maxChunkX: number; minChunkZ: number; maxChunkZ: number } {
        const minCell = this.terrain.worldToCell(this.terrain.bounds.minX, this.terrain.bounds.minZ);
        const maxCell = this.terrain.worldToCell(this.terrain.bounds.maxX, this.terrain.bounds.maxZ);
        const minChunk = this.worldCellToChunk(minCell.x, minCell.z);
        const maxChunk = this.worldCellToChunk(maxCell.x, maxCell.z);
        return {
            minChunkX: minChunk.chunkX,
            maxChunkX: maxChunk.chunkX,
            minChunkZ: minChunk.chunkZ,
            maxChunkZ: maxChunk.chunkZ,
        };
    }

    private getChunkCellRect(chunkX: number, chunkZ: number): DirtyRect {
        const minCell = this.terrain.worldToCell(this.terrain.bounds.minX, this.terrain.bounds.minZ);
        const maxCell = this.terrain.worldToCell(this.terrain.bounds.maxX, this.terrain.bounds.maxZ);
        const rawMinCellX = chunkX * this.chunkSizeCells;
        const rawMinCellZ = chunkZ * this.chunkSizeCells;

        return {
            minCellX: Math.max(minCell.x, rawMinCellX),
            maxCellX: Math.min(maxCell.x, rawMinCellX + this.chunkSizeCells - 1),
            minCellZ: Math.max(minCell.z, rawMinCellZ),
            maxCellZ: Math.min(maxCell.z, rawMinCellZ + this.chunkSizeCells - 1),
        };
    }

    private buildWalkableCellSetInRect(rect: DirtyRect, clearanceCells: number): Set<string> {
        const set = new Set<string>();

        for (let z = rect.minCellZ; z <= rect.maxCellZ; z++) {
            for (let x = rect.minCellX; x <= rect.maxCellX; x++) {
                if (this.isCellWalkable(x, z, clearanceCells)) {
                    set.add(this.toCellKey(x, z));
                }
            }
        }

        return set;
    }

    private mergeWalkableCells(cells: Set<string>, createRegionId: (index: number) => string): NavMeshRegion[] {
        const remaining = new Set(cells);
        const regions: NavMeshRegion[] = [];
        let index = 0;

        while (remaining.size > 0) {
            const firstKey = Array.from(remaining).sort(this.compareCellKeys)[0];
            const { cellX, cellZ } = this.parseCellKey(firstKey);
            let width = 1;
            let height = 1;

            while (remaining.has(this.toCellKey(cellX + width, cellZ))) {
                width++;
            }

            let canExtend = true;
            while (canExtend) {
                const nextRow = cellZ + height;
                for (let x = cellX; x < cellX + width; x++) {
                    if (!remaining.has(this.toCellKey(x, nextRow))) {
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
                    remaining.delete(this.toCellKey(x, z));
                }
            }

            regions.push({
                id: createRegionId(index++),
                cellX,
                cellZ,
                width,
                height,
            });
        }

        return regions;
    }

    private buildPortal(left: NavMeshRegion, right: NavMeshRegion): NavMeshPortal | null {
        const leftMinX = left.cellX;
        const leftMaxX = left.cellX + left.width;
        const leftMinZ = left.cellZ;
        const leftMaxZ = left.cellZ + left.height;
        const rightMinX = right.cellX;
        const rightMaxX = right.cellX + right.width;
        const rightMinZ = right.cellZ;
        const rightMaxZ = right.cellZ + right.height;

        if (leftMaxX === rightMinX || rightMaxX === leftMinX) {
            const overlapMinZ = Math.max(leftMinZ, rightMinZ);
            const overlapMaxZ = Math.min(leftMaxZ, rightMaxZ);
            if (overlapMinZ < overlapMaxZ) {
                const boundaryX = (leftMaxX === rightMinX ? rightMinX : leftMinX) * this.terrain.cellSize;
                return {
                    fromRegionId: left.id,
                    toRegionId: right.id,
                    start: { x: boundaryX, z: overlapMinZ * this.terrain.cellSize },
                    end: { x: boundaryX, z: overlapMaxZ * this.terrain.cellSize },
                };
            }
        }

        if (leftMaxZ === rightMinZ || rightMaxZ === leftMinZ) {
            const overlapMinX = Math.max(leftMinX, rightMinX);
            const overlapMaxX = Math.min(leftMaxX, rightMaxX);
            if (overlapMinX < overlapMaxX) {
                const boundaryZ = (leftMaxZ === rightMinZ ? rightMinZ : leftMinZ) * this.terrain.cellSize;
                return {
                    fromRegionId: left.id,
                    toRegionId: right.id,
                    start: { x: overlapMinX * this.terrain.cellSize, z: boundaryZ },
                    end: { x: overlapMaxX * this.terrain.cellSize, z: boundaryZ },
                };
            }
        }

        return null;
    }

    private findRegionAt(regions: NavMeshRegion[], x: number, z: number): NavMeshRegion | null {
        const cell = this.terrain.worldToCell(x, z);
        for (const region of regions) {
            if (
                cell.x >= region.cellX &&
                cell.x < region.cellX + region.width &&
                cell.z >= region.cellZ &&
                cell.z < region.cellZ + region.height
            ) {
                return region;
            }
        }
        return null;
    }

    private findRegionPath(
        cache: NavMeshCache,
        startRegionId: string,
        goalRegionId: string,
        options: NavMeshFindPathOptions,
    ): string[] | null {
        const open: RegionNode[] = [];
        const openKeys = new Set<string>();
        const closed = new Set<string>();
        const allNodes = new Map<string, RegionNode>();
        const maxVisitedRegions = options.maxVisitedRegions ?? 256;
        let visited = 0;

        const startRegion = cache.regionById.get(startRegionId);
        const goalRegion = cache.regionById.get(goalRegionId);
        if (!startRegion || !goalRegion) {
            return null;
        }

        const startNode: RegionNode = {
            id: startRegionId,
            g: 0,
            h: this.regionHeuristic(startRegion, goalRegion),
            f: 0,
            parentId: null,
        };
        startNode.f = startNode.g + startNode.h;
        open.push(startNode);
        openKeys.add(startRegionId);
        allNodes.set(startRegionId, startNode);

        while (open.length > 0 && visited < maxVisitedRegions) {
            const currentIndex = this.findLowestRegionFIndex(open);
            const current = open.splice(currentIndex, 1)[0];
            openKeys.delete(current.id);

            if (closed.has(current.id)) {
                continue;
            }
            closed.add(current.id);
            visited++;

            if (current.id === goalRegionId) {
                return this.rebuildRegionPath(allNodes, current.id);
            }

            for (const neighborId of cache.adjacency.get(current.id) ?? []) {
                if (closed.has(neighborId)) {
                    continue;
                }

                const currentRegion = cache.regionById.get(current.id);
                const neighborRegion = cache.regionById.get(neighborId);
                if (!currentRegion || !neighborRegion) {
                    continue;
                }

                const tentativeG = current.g + this.regionDistance(currentRegion, neighborRegion);
                const existing = allNodes.get(neighborId);
                if (existing && tentativeG >= existing.g) {
                    continue;
                }

                const node: RegionNode = existing ?? {
                    id: neighborId,
                    g: tentativeG,
                    h: this.regionHeuristic(neighborRegion, goalRegion),
                    f: 0,
                    parentId: current.id,
                };

                node.g = tentativeG;
                node.h = this.regionHeuristic(neighborRegion, goalRegion);
                node.f = node.g + node.h;
                node.parentId = current.id;

                allNodes.set(neighborId, node);
                if (!openKeys.has(neighborId)) {
                    open.push(node);
                    openKeys.add(neighborId);
                }
            }
        }

        return null;
    }

    private rebuildRegionPath(nodes: Map<string, RegionNode>, goalId: string): string[] {
        const path: string[] = [];
        let currentId: string | null = goalId;

        while (currentId) {
            path.push(currentId);
            currentId = nodes.get(currentId)?.parentId ?? null;
        }

        return path.reverse();
    }

    private smoothPath(from: GridPoint, rawPoints: GridPoint[], clearanceCells: number): GridPoint[] {
        if (rawPoints.length <= 1) {
            return rawPoints;
        }

        const result: GridPoint[] = [];
        let anchor = { ...from };
        let index = 0;

        while (index < rawPoints.length) {
            let furthest = index;
            for (let i = index; i < rawPoints.length; i++) {
                if (this.hasLineOfSight(anchor, rawPoints[i], clearanceCells)) {
                    furthest = i;
                } else {
                    break;
                }
            }

            const nextPoint = rawPoints[furthest];
            result.push({ ...nextPoint });
            anchor = nextPoint;
            index = furthest + 1;
        }

        return result;
    }

    private measurePathLength(from: GridPoint, path: GridPoint[]): number {
        let total = 0;
        let previous = from;

        for (const point of path) {
            const dx = point.x - previous.x;
            const dz = point.z - previous.z;
            total += Math.sqrt((dx * dx) + (dz * dz));
            previous = point;
        }

        return total;
    }

    private validatePathSegments(from: GridPoint, path: GridPoint[], clearanceCells: number): boolean {
        let previous = from;
        for (const point of path) {
            if (!this.hasLineOfSight(previous, point, clearanceCells)) {
                return false;
            }
            previous = point;
        }
        return true;
    }

    private stringPullPortals(
        from: GridPoint,
        to: GridPoint,
        portals: NavMeshPortal[],
        cache: NavMeshCache,
    ): GridPoint[] {
        if (portals.length === 0) {
            return [to];
        }

        const orderedPortals = [
            { left: { ...from }, right: { ...from } },
            ...portals.map((portal) => this.toOrderedPortal(portal, cache)),
            { left: { ...to }, right: { ...to } },
        ];

        const result: GridPoint[] = [];
        let apex = { ...from };
        let left = { ...orderedPortals[1].left };
        let right = { ...orderedPortals[1].right };
        let apexIndex = 0;
        let leftIndex = 1;
        let rightIndex = 1;

        for (let i = 2; i < orderedPortals.length; i++) {
            const nextLeft = orderedPortals[i].left;
            const nextRight = orderedPortals[i].right;

            if (this.triangleArea2(apex, right, nextRight) <= 0) {
                if (this.pointsEqual(apex, right) || this.triangleArea2(apex, left, nextRight) > 0) {
                    right = { ...nextRight };
                    rightIndex = i;
                } else {
                    result.push({ ...left });
                    apex = { ...left };
                    apexIndex = leftIndex;
                    left = { ...apex };
                    right = { ...apex };
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;
                    i = apexIndex + 1;
                    continue;
                }
            }

            if (this.triangleArea2(apex, left, nextLeft) >= 0) {
                if (this.pointsEqual(apex, left) || this.triangleArea2(apex, right, nextLeft) < 0) {
                    left = { ...nextLeft };
                    leftIndex = i;
                } else {
                    result.push({ ...right });
                    apex = { ...right };
                    apexIndex = rightIndex;
                    left = { ...apex };
                    right = { ...apex };
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;
                    i = apexIndex + 1;
                }
            }
        }

        result.push({ ...to });
        return result;
    }

    private hasLineOfSight(from: GridPoint, to: GridPoint, clearanceCells: number): boolean {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const dist = Math.sqrt((dx * dx) + (dz * dz));
        if (dist <= 0) {
            return true;
        }

        const stepSize = Math.max(this.terrain.cellSize * 0.5, 0.25);
        const steps = Math.max(1, Math.ceil(dist / stepSize));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + dx * t;
            const z = from.z + dz * t;
            const cell = this.terrain.worldToCell(x, z);
            if (!this.isCellWalkable(cell.x, cell.z, clearanceCells)) {
                return false;
            }
        }

        return true;
    }

    private isCellWalkable(cellX: number, cellZ: number, clearanceCells: number): boolean {
        for (let dz = -clearanceCells; dz <= clearanceCells; dz++) {
            for (let dx = -clearanceCells; dx <= clearanceCells; dx++) {
                const world = this.terrain.cellToWorld(cellX + dx, cellZ + dz);
                if (!this.terrain.isWalkable(world.x, world.z) || this.occupancy.isOccupiedWorld(world.x, world.z)) {
                    return false;
                }
            }
        }

        return true;
    }

    private getPortalMidpoint(portal: NavMeshPortal): GridPoint {
        return {
            x: (portal.start.x + portal.end.x) * 0.5,
            z: (portal.start.z + portal.end.z) * 0.5,
        };
    }

    private toOrderedPortal(portal: NavMeshPortal, cache: NavMeshCache): { left: GridPoint; right: GridPoint } {
        const midpoint = this.getPortalMidpoint(portal);
        const fromRegion = cache.regionById.get(portal.fromRegionId);
        const toRegion = cache.regionById.get(portal.toRegionId);
        if (!fromRegion || !toRegion) {
            return {
                left: { ...portal.start },
                right: { ...portal.end },
            };
        }

        // 按区域穿越方向给 portal 边段排左右，供 funnel/string-pulling 使用。
        const fromCenter = this.getRegionCenter(fromRegion);
        const toCenter = this.getRegionCenter(toRegion);
        const dirX = toCenter.x - fromCenter.x;
        const dirZ = toCenter.z - fromCenter.z;
        const cross = dirX * (portal.start.z - midpoint.z) - dirZ * (portal.start.x - midpoint.x);
        if (cross >= 0) {
            return {
                left: { ...portal.start },
                right: { ...portal.end },
            };
        }

        return {
            left: { ...portal.end },
            right: { ...portal.start },
        };
    }

    private triangleArea2(a: GridPoint, b: GridPoint, c: GridPoint): number {
        return ((b.x - a.x) * (c.z - a.z)) - ((b.z - a.z) * (c.x - a.x));
    }

    private pointsEqual(left: GridPoint, right: GridPoint, epsilon: number = 1e-6): boolean {
        return Math.abs(left.x - right.x) <= epsilon && Math.abs(left.z - right.z) <= epsilon;
    }

    private expandDirtyRect(rect: DirtyRect): DirtyRect {
        return {
            minCellX: rect.minCellX - this.maxClearanceCells,
            maxCellX: rect.maxCellX + this.maxClearanceCells,
            minCellZ: rect.minCellZ - this.maxClearanceCells,
            maxCellZ: rect.maxCellZ + this.maxClearanceCells,
        };
    }

    private worldCellToChunk(cellX: number, cellZ: number): { chunkX: number; chunkZ: number } {
        return {
            chunkX: Math.floor(cellX / this.chunkSizeCells),
            chunkZ: Math.floor(cellZ / this.chunkSizeCells),
        };
    }

    private toCellKey(cellX: number, cellZ: number): string {
        return `${cellX},${cellZ}`;
    }

    private toChunkKey(chunkX: number, chunkZ: number): string {
        return `${chunkX},${chunkZ}`;
    }

    private toPortalKey(fromRegionId: string, toRegionId: string): string {
        return `${fromRegionId}->${toRegionId}`;
    }

    private parseCellKey(key: string): { cellX: number; cellZ: number } {
        const [cellX, cellZ] = key.split(",").map(Number);
        return { cellX, cellZ };
    }

    private parseChunkKey(key: string): { chunkX: number; chunkZ: number } {
        const [chunkX, chunkZ] = key.split(",").map(Number);
        return { chunkX, chunkZ };
    }

    private compareCellKeys = (left: string, right: string): number => {
        const a = this.parseCellKey(left);
        const b = this.parseCellKey(right);
        if (a.cellZ !== b.cellZ) {
            return a.cellZ - b.cellZ;
        }
        return a.cellX - b.cellX;
    };

    private findLowestRegionFIndex(open: RegionNode[]): number {
        let bestIndex = 0;
        let bestNode = open[0];

        for (let i = 1; i < open.length; i++) {
            const node = open[i];
            if (node.f < bestNode.f || (node.f === bestNode.f && node.h < bestNode.h)) {
                bestIndex = i;
                bestNode = node;
            }
        }

        return bestIndex;
    }

    private regionHeuristic(from: NavMeshRegion, to: NavMeshRegion): number {
        return this.regionDistance(from, to);
    }

    private regionDistance(from: NavMeshRegion, to: NavMeshRegion): number {
        const fromCenter = this.getRegionCenter(from);
        const toCenter = this.getRegionCenter(to);
        const dx = toCenter.x - fromCenter.x;
        const dz = toCenter.z - fromCenter.z;
        return Math.sqrt((dx * dx) + (dz * dz));
    }

    private getRegionCenter(region: NavMeshRegion): GridPoint {
        return {
            x: (region.cellX + region.width * 0.5) * this.terrain.cellSize,
            z: (region.cellZ + region.height * 0.5) * this.terrain.cellSize,
        };
    }
}
