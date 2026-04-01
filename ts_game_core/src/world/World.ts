import { Entity, ComponentConstructor } from "../core/Entity";
import { Transform } from "../components/Transform";
import { BrainManager } from "../core/behavior/BrainManager";
import { SGManager } from "../core/stategraph/SGManager";
import type { Physics } from "../physics";
import { MapContext } from "./MapContext";
import { MapLink } from "./MapLink";
import { FindPathOptions, NavAgentSize } from "./layers";
import { MainThreadPathfinder } from "./pathfinding";
import { PlacementSystem } from "./PlacementSystem";
import { WalkableMap } from "./WalkableMap";

export interface WorldSaveData {
    defaultMapId: string;
    maps: Array<ReturnType<MapContext["serialize"]>>;
    brainTime: number;
    sgTime: number;
    entities: ReturnType<Entity["serialize"]>[];
}

export interface FindEntitiesOptions {
    center: { x: number; z: number };
    radius: number;
    includeInvalid?: boolean;
    filter?: (entity: Entity) => boolean;
    map?: MapContext | string | null;
}

export interface WorldObstacleOptions {
    entity?: Entity;
    x: number;
    z: number;
    map?: MapContext | string | null;
    occupancyId?: string;
    footprint?: { width: number; height: number };
}

// 世界：负责管理实体、多地图实例和地图之间的桥接关系。
export class World {
    private entities: Set<Entity> = new Set();
    private removeListeners: Map<number, () => void> = new Map();
    private readonly maps: Map<string, MapContext> = new Map();
    private readonly mapLinks: Map<string, MapLink> = new Map();
    private defaultMapId: string;
    public physics: Physics | null = null;
    public readonly placement: PlacementSystem;
    public readonly brainManager: BrainManager;
    public readonly sgManager: SGManager;
    public readonly pathfinder: MainThreadPathfinder;

    constructor(defaultMap: MapContext = new WalkableMap()) {
        this.defaultMapId = defaultMap.id;
        this.maps.set(defaultMap.id, defaultMap);
        this.brainManager = new BrainManager();
        this.sgManager = new SGManager();
        this.pathfinder = new MainThreadPathfinder(this);
        this.placement = new PlacementSystem(this);
    }

    public get map(): MapContext {
        return this.getDefaultMap();
    }

    public setPhysics(physics: Physics | null): void {
        this.physics = physics;
        for (const map of this.maps.values()) {
            map.setPhysics(physics);
        }
    }

    public addMap(map: MapContext, options?: { setDefault?: boolean }): void {
        this.maps.set(map.id, map);
        map.setPhysics(this.physics);
        if (options?.setDefault) {
            this.defaultMapId = map.id;
        }
    }

    public getMap(id: string): MapContext | null {
        return this.maps.get(id) ?? null;
    }

    public getDefaultMap(): MapContext {
        const map = this.maps.get(this.defaultMapId);
        if (!map) {
            throw new Error(`Default map '${this.defaultMapId}' not found.`);
        }
        return map;
    }

    public addLink(link: MapLink): void {
        this.mapLinks.set(link.id, link);
    }

    public getLink(id: string): MapLink | null {
        return this.mapLinks.get(id) ?? null;
    }

    public addEntity(entity: Entity, map: MapContext | string | null = null): void {
        if (this.entities.has(entity)) {
            return;
        }

        this.entities.add(entity);
        entity.setWorld(this);
        const resolvedMap = this.resolveMap(map);
        entity.setMap(resolvedMap);

        const onRemove = () => {
            this.removeEntity(entity);
        };
        this.removeListeners.set(entity.GUID, onRemove);
        entity.listenForEvent("onremove", onRemove);
        entity.sg?.start();
        entity.brain?.start();
        entity.pushEvent("onaddedtoworld", {
            world: this,
            map: resolvedMap,
        });
    }

    public moveEntityToMap(entity: Entity, map: MapContext | string, worldPosition?: { x: number; z: number }): void {
        const previousMap = entity.map;
        const resolvedMap = this.resolveMap(map);
        entity.setMap(resolvedMap);
        if (worldPosition) {
            const transform = entity.getComponent(Transform);
            if (transform) {
                transform.setPosition(worldPosition.x, transform.y, worldPosition.z);
            }
        }
        entity.pushEvent("onmapchanged", {
            world: this,
            previousMap,
            map: resolvedMap,
        });
    }

    public removeEntity(entity: Entity): void {
        if (!this.entities.has(entity)) {
            return;
        }

        this.entities.delete(entity);
        entity.brain?.stop();
        entity.sg?.stop();
        entity.pushEvent("onremovedfromworld", {
            world: this,
            map: entity.map,
        });
        entity.setMap(null);
        entity.setWorld(null);

        const onRemove = this.removeListeners.get(entity.GUID);
        if (onRemove) {
            entity.removeEventCallback("onremove", onRemove);
            this.removeListeners.delete(entity.GUID);
        }
    }

    public getEntities(): Entity[] {
        return Array.from(this.entities);
    }

    public update(dt: number): void {
        for (const map of this.maps.values()) {
            map.flushLayers();
        }

        this.sgManager.update(dt);
        this.brainManager.update(dt);
        this.pathfinder.update(dt);

        for (const entity of this.entities) {
            if (!entity.isValid) {
                continue;
            }
            entity.update(dt);
        }

        if (this.physics) {
            for (const entity of this.entities) {
                if (!entity.isValid || !entity.physics) {
                    continue;
                }
                this.physics.syncEntityToPhysics(entity);
            }

            this.physics.step(dt);

            for (const entity of this.entities) {
                if (!entity.isValid || !entity.physics) {
                    continue;
                }
                this.physics.syncEntityFromPhysics(entity);
            }
        }
    }

    public isWalkable(
        x: number,
        z: number,
        map: MapContext | string | null = null,
        agentSize: NavAgentSize = "small",
    ): boolean {
        return this.resolveMap(map).isWalkableForAgent(x, z, agentSize);
    }

    public isBlocked(
        x: number,
        z: number,
        map: MapContext | string | null = null,
        agentSize: NavAgentSize = "small",
    ): boolean {
        return !this.isWalkable(x, z, map, agentSize);
    }

    public isPathClear(
        from: { x: number; z: number },
        to: { x: number; z: number },
        map: MapContext | string | null = null,
        agentSize: NavAgentSize = "small",
    ): boolean {
        return this.resolveMap(map).isPathClear(from, to, agentSize);
    }

    public findDetourPoint(
        from: { x: number; z: number },
        to: { x: number; z: number },
        searchDistance?: number,
        map: MapContext | string | null = null,
        agentSize: NavAgentSize = "small",
    ): { x: number; z: number } | null {
        return this.resolveMap(map).findDetourPoint(from, to, searchDistance, agentSize);
    }

    public findPathImmediate(
        from: { x: number; z: number },
        to: { x: number; z: number },
        options?: FindPathOptions,
        map: MapContext | string | null = null,
    ): Array<{ x: number; z: number }> | null {
        return this.resolveMap(map).findPath(from, to, options);
    }

    public findEntitiesInRange(options: FindEntitiesOptions): Entity[] {
        const radiusSq = options.radius * options.radius;
        const result: Entity[] = [];
        const targetMap = this.resolveMap(options.map ?? null);

        for (const entity of this.entities) {
            if (!options.includeInvalid && !entity.isValid) {
                continue;
            }

            if (entity.map !== targetMap) {
                continue;
            }

            const transform = entity.getComponent(Transform);
            if (!transform) {
                continue;
            }

            const dx = transform.x - options.center.x;
            const dz = transform.z - options.center.z;
            const distSq = (dx * dx) + (dz * dz);

            if (distSq > radiusSq) {
                continue;
            }

            if (options.filter && !options.filter(entity)) {
                continue;
            }

            result.push(entity);
        }

        return result;
    }

    public findClosestEntity(
        center: { x: number; z: number },
        radius: number,
        filter?: (entity: Entity) => boolean,
        map: MapContext | string | null = null,
    ): Entity | null {
        let closest: Entity | null = null;
        let bestDistSq = Infinity;

        for (const entity of this.findEntitiesInRange({ center, radius, filter, map })) {
            const transform = entity.getComponent(Transform);
            if (!transform) {
                continue;
            }

            const dx = transform.x - center.x;
            const dz = transform.z - center.z;
            const distSq = (dx * dx) + (dz * dz);
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                closest = entity;
            }
        }

        return closest;
    }

    public findClosestEntityFromInst(
        inst: Entity,
        radius: number,
        filter?: (entity: Entity) => boolean,
    ): Entity | null {
        const transform = inst.getComponent(Transform);
        if (!transform) {
            return null;
        }

        return this.findClosestEntity(
            { x: transform.x, z: transform.z },
            radius,
            (entity) => entity !== inst && (!filter || filter(entity)),
            inst.map,
        );
    }

    public findWalkableOffset(
        origin: { x: number; z: number },
        angleRad: number,
        distance: number,
        attempts: number = 8,
        map: MapContext | string | null = null,
        agentSize: NavAgentSize = "small",
    ): { x: number; z: number } | null {
        return this.resolveMap(map).findWalkableOffset(origin, angleRad, distance, attempts, agentSize);
    }

    public addObstacle(options: WorldObstacleOptions): void {
        this.placement.place({
            id: options.occupancyId ?? options.entity?.GUID.toString() ?? `${options.x},${options.z}`,
            x: options.x,
            z: options.z,
            entity: options.entity,
            map: options.map ?? options.entity?.map ?? null,
            footprint: options.footprint,
        });
    }

    public removeObstacle(options: { entity?: Entity; x?: number; z?: number; map?: MapContext | string | null; occupancyId?: string }): void {
        this.placement.remove({
            id: options.occupancyId,
            entity: options.entity,
            x: options.x,
            z: options.z,
            map: options.map ?? options.entity?.map ?? null,
        });
    }

    public resolveMap(map: MapContext | string | null): MapContext {
        if (!map) {
            return this.getDefaultMap();
        }

        if (typeof map === "string") {
            const byId = this.maps.get(map);
            if (!byId) {
                throw new Error(`Map '${map}' not found.`);
            }
            return byId;
        }

        return map;
    }

    public serialize(): WorldSaveData {
        return {
            defaultMapId: this.defaultMapId,
            maps: Array.from(this.maps.values()).map((map) => map.serialize()),
            brainTime: this.brainManager.currentTime,
            sgTime: this.sgManager.currentTime,
            entities: this.getEntities()
                .filter((entity) => entity.isValid)
                .map((entity) => entity.serialize()),
        };
    }
}
