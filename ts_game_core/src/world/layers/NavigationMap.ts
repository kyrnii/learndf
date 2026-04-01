import { getNavAgentClearanceCells, NavAgentSize } from "./NavAgent";
import { OccupancyMap } from "./OccupancyMap";
import { GridPoint, TerrainMap } from "./TerrainMap";

export interface FindPathOptions {
    maxVisitedNodes?: number;
    agentSize?: NavAgentSize;
}

interface PathNode {
    cellX: number;
    cellZ: number;
    g: number;
    h: number;
    f: number;
    parentKey: string | null;
}

// 导航层：负责按不同体型做网格可走性判断、局部绕障和 A* 寻路。
export class NavigationMap {
    private dirtyCells: Set<string> = new Set();

    constructor(
        public readonly terrain: TerrainMap,
        public readonly occupancy: OccupancyMap,
    ) {}

    private toCellKey(cellX: number, cellZ: number): string {
        return `${cellX},${cellZ}`;
    }

    public invalidateCell(cellX: number, cellZ: number): void {
        this.dirtyCells.add(this.toCellKey(cellX, cellZ));
    }

    public invalidateRect(cellX: number, cellZ: number, width: number, height: number): void {
        for (let z = cellZ; z < cellZ + height; z++) {
            for (let x = cellX; x < cellX + width; x++) {
                this.invalidateCell(x, z);
            }
        }
    }

    public isWalkable(x: number, z: number, agentSize: NavAgentSize = "small"): boolean {
        const cell = this.terrain.worldToCell(x, z);
        return this.isCellWalkable(cell.x, cell.z, getNavAgentClearanceCells(agentSize));
    }

    public isPathWalkable(
        from: GridPoint,
        to: GridPoint,
        agentSize: NavAgentSize = "small",
        stepSize: number = Math.max(this.terrain.cellSize * 0.5, 0.25),
    ): boolean {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const dist = Math.sqrt((dx * dx) + (dz * dz));

        if (dist <= 0) {
            return this.isWalkable(from.x, from.z, agentSize);
        }

        const steps = Math.max(1, Math.ceil(dist / stepSize));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + dx * t;
            const z = from.z + dz * t;
            if (!this.isWalkable(x, z, agentSize)) {
                return false;
            }
        }

        return true;
    }

    public findNearbyWalkableOffset(
        origin: GridPoint,
        angleRad: number,
        distance: number,
        attempts: number = 8,
        agentSize: NavAgentSize = "small",
    ): GridPoint | null {
        for (let i = 0; i < attempts; i++) {
            const offsetAngle = angleRad + ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / attempts));
            const x = origin.x + Math.cos(offsetAngle) * distance;
            const z = origin.z + Math.sin(offsetAngle) * distance;
            if (this.isWalkable(x, z, agentSize)) {
                return { x, z };
            }
        }

        return null;
    }

    public findSimpleDetour(
        origin: GridPoint,
        target: GridPoint,
        searchDistance: number,
        agentSize: NavAgentSize = "small",
        attempts: number = 12,
    ): GridPoint | null {
        const baseAngle = Math.atan2(target.z - origin.z, target.x - origin.x);
        const distances = [
            searchDistance,
            searchDistance + this.terrain.cellSize,
            searchDistance + this.terrain.cellSize * 2,
        ];

        for (const distance of distances) {
            for (let i = 0; i < attempts; i++) {
                const offsetIndex = Math.ceil(i / 2);
                const offsetSign = i % 2 === 0 ? 1 : -1;
                const offsetAngle = baseAngle + offsetSign * offsetIndex * (Math.PI / attempts);
                const candidate = {
                    x: origin.x + Math.cos(offsetAngle) * distance,
                    z: origin.z + Math.sin(offsetAngle) * distance,
                };

                if (!this.isWalkable(candidate.x, candidate.z, agentSize)) {
                    continue;
                }

                if (!this.isPathWalkable(origin, candidate, agentSize)) {
                    continue;
                }

                if (!this.isPathWalkable(candidate, target, agentSize)) {
                    continue;
                }

                return candidate;
            }
        }

        return null;
    }

    public findPath(
        from: GridPoint,
        to: GridPoint,
        options: FindPathOptions = {},
    ): GridPoint[] | null {
        const agentSize = options.agentSize ?? "small";
        const clearanceCells = getNavAgentClearanceCells(agentSize);

        if (this.isPathWalkable(from, to, agentSize)) {
            return [to];
        }

        const startCell = this.terrain.worldToCell(from.x, from.z);
        const goalCell = this.terrain.worldToCell(to.x, to.z);

        if (!this.isCellWalkable(goalCell.x, goalCell.z, clearanceCells)) {
            return null;
        }

        const startKey = this.toCellKey(startCell.x, startCell.z);
        const goalKey = this.toCellKey(goalCell.x, goalCell.z);
        const open: PathNode[] = [];
        const openKeys: Set<string> = new Set();
        const closed: Set<string> = new Set();
        const allNodes: Map<string, PathNode> = new Map();
        const maxVisitedNodes = options.maxVisitedNodes ?? 512;
        let visitedNodes = 0;

        const startNode: PathNode = {
            cellX: startCell.x,
            cellZ: startCell.z,
            g: 0,
            h: this.heuristic(startCell.x, startCell.z, goalCell.x, goalCell.z),
            f: 0,
            parentKey: null,
        };
        startNode.f = startNode.g + startNode.h;

        open.push(startNode);
        openKeys.add(startKey);
        allNodes.set(startKey, startNode);

        while (open.length > 0 && visitedNodes < maxVisitedNodes) {
            const currentIndex = this.findLowestFIndex(open);
            const current = open.splice(currentIndex, 1)[0];
            const currentKey = this.toCellKey(current.cellX, current.cellZ);
            openKeys.delete(currentKey);

            if (closed.has(currentKey)) {
                continue;
            }
            closed.add(currentKey);
            visitedNodes++;

            if (currentKey === goalKey) {
                return this.rebuildPath(allNodes, currentKey, from, to);
            }

            for (const neighbor of this.getNeighbors(current.cellX, current.cellZ)) {
                const neighborKey = this.toCellKey(neighbor.cellX, neighbor.cellZ);
                if (closed.has(neighborKey)) {
                    continue;
                }

                if (!this.canTraverseNeighbor(current.cellX, current.cellZ, neighbor.cellX, neighbor.cellZ, clearanceCells)) {
                    continue;
                }

                const tentativeG = current.g + neighbor.cost;
                const existing = allNodes.get(neighborKey);
                if (existing && tentativeG >= existing.g) {
                    continue;
                }

                const node: PathNode = existing ?? {
                    cellX: neighbor.cellX,
                    cellZ: neighbor.cellZ,
                    g: tentativeG,
                    h: this.heuristic(neighbor.cellX, neighbor.cellZ, goalCell.x, goalCell.z),
                    f: 0,
                    parentKey: currentKey,
                };

                node.g = tentativeG;
                node.h = this.heuristic(neighbor.cellX, neighbor.cellZ, goalCell.x, goalCell.z);
                node.f = node.g + node.h;
                node.parentKey = currentKey;

                allNodes.set(neighborKey, node);

                if (!openKeys.has(neighborKey)) {
                    open.push(node);
                    openKeys.add(neighborKey);
                }
            }
        }

        return null;
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

    private heuristic(fromCellX: number, fromCellZ: number, toCellX: number, toCellZ: number): number {
        const dx = Math.abs(toCellX - fromCellX);
        const dz = Math.abs(toCellZ - fromCellZ);
        return Math.max(dx, dz);
    }

    private findLowestFIndex(open: PathNode[]): number {
        let bestIndex = 0;
        let bestNode = open[0];

        for (let i = 1; i < open.length; i++) {
            const node = open[i];
            if (node.f < bestNode.f || (node.f === bestNode.f && node.h < bestNode.h)) {
                bestNode = node;
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    private getNeighbors(cellX: number, cellZ: number): Array<{ cellX: number; cellZ: number; cost: number }> {
        return [
            { cellX: cellX + 1, cellZ, cost: 1 },
            { cellX: cellX - 1, cellZ, cost: 1 },
            { cellX, cellZ: cellZ + 1, cost: 1 },
            { cellX, cellZ: cellZ - 1, cost: 1 },
            { cellX: cellX + 1, cellZ: cellZ + 1, cost: Math.SQRT2 },
            { cellX: cellX + 1, cellZ: cellZ - 1, cost: Math.SQRT2 },
            { cellX: cellX - 1, cellZ: cellZ + 1, cost: Math.SQRT2 },
            { cellX: cellX - 1, cellZ: cellZ - 1, cost: Math.SQRT2 },
        ];
    }

    private canTraverseNeighbor(
        fromCellX: number,
        fromCellZ: number,
        toCellX: number,
        toCellZ: number,
        clearanceCells: number,
    ): boolean {
        if (!this.isCellWalkable(toCellX, toCellZ, clearanceCells)) {
            return false;
        }

        const deltaX = toCellX - fromCellX;
        const deltaZ = toCellZ - fromCellZ;
        if (deltaX !== 0 && deltaZ !== 0) {
            if (
                !this.isCellWalkable(fromCellX + deltaX, fromCellZ, clearanceCells) ||
                !this.isCellWalkable(fromCellX, fromCellZ + deltaZ, clearanceCells)
            ) {
                return false;
            }
        }

        return true;
    }

    private rebuildPath(
        allNodes: Map<string, PathNode>,
        goalKey: string,
        from: GridPoint,
        to: GridPoint,
    ): GridPoint[] {
        const cells: GridPoint[] = [];
        let currentKey: string | null = goalKey;

        while (currentKey) {
            const node = allNodes.get(currentKey);
            if (!node) {
                break;
            }

            cells.push(this.terrain.cellToWorld(node.cellX, node.cellZ));
            currentKey = node.parentKey;
        }

        cells.reverse();

        const filtered = cells.filter((point) => {
            const dx = point.x - from.x;
            const dz = point.z - from.z;
            return (dx * dx) + (dz * dz) > 0.0001;
        });

        if (filtered.length === 0) {
            return [to];
        }

        filtered[filtered.length - 1] = { x: to.x, z: to.z };
        return filtered;
    }
}
