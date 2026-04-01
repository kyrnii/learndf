import { Component } from "../core/Component";
import { Transform } from "./Transform";
import { MapContext, PlacementFootprint, PlacementRotation } from "../world";

export interface PlaceableSaveData {
    placementId: string | null;
    footprint: PlacementFootprint;
    rotation: PlacementRotation;
    createPhysicsObstacle: boolean;
    blockTerrainCell: boolean;
    autoPlaceOnWorldJoin: boolean;
    placed: boolean;
}

// 可放置物组件：描述实体进入世界后应如何占用地图，并可选同步为物理障碍。
export class Placeable extends Component {
    public placementId: string | null = null;
    public footprint: PlacementFootprint = { width: 1, height: 1 };
    public rotation: PlacementRotation = 0;
    public createPhysicsObstacle: boolean = true;
    public blockTerrainCell: boolean = true;
    public autoPlaceOnWorldJoin: boolean = true;

    private placed = false;

    public onAdd(): void {
        this.inst.listenForEvent("onaddedtoworld", () => {
            if (this.autoPlaceOnWorldJoin) {
                this.placeInWorld();
            }
        });

        this.inst.listenForEvent("onmapchanged", (data?: { previousMap?: MapContext | null }) => {
            if (this.autoPlaceOnWorldJoin) {
                this.removeFromWorld(data?.previousMap ?? null);
                this.placeInWorld();
            }
        });

        this.inst.listenForEvent("onremovedfromworld", () => {
            this.removeFromWorld();
        });

        if (this.autoPlaceOnWorldJoin && this.inst.world && this.inst.map) {
            this.placeInWorld();
        }
    }

    public onRemove(): void {
        this.removeFromWorld();
    }

    public placeInWorld(): boolean {
        const world = this.inst.world;
        const map = this.inst.map;
        const transform = this.inst.getComponent(Transform);
        if (!world || !map || !transform) {
            return false;
        }

        const placed = world.placement.place({
            id: this.getPlacementId(),
            x: transform.x,
            z: transform.z,
            footprint: this.footprint,
            rotation: this.rotation,
            entity: this.inst,
            map,
            createPhysicsObstacle: this.createPhysicsObstacle,
            blockTerrainCell: this.blockTerrainCell,
        });

        this.placed = placed;
        return placed;
    }

    public removeFromWorld(mapOverride?: MapContext | null): void {
        if (!this.placed || !this.inst.world) {
            return;
        }

        this.inst.world.placement.remove({
            id: this.getPlacementId(),
            entity: this.inst,
            map: mapOverride ?? this.inst.map,
            clearTerrainCell: this.blockTerrainCell,
        });
        this.placed = false;
    }

    public isPlaced(): boolean {
        return this.placed;
    }

    public serialize(): PlaceableSaveData {
        return {
            placementId: this.placementId,
            footprint: { ...this.footprint },
            rotation: this.rotation,
            createPhysicsObstacle: this.createPhysicsObstacle,
            blockTerrainCell: this.blockTerrainCell,
            autoPlaceOnWorldJoin: this.autoPlaceOnWorldJoin,
            placed: this.placed,
        };
    }

    public deserialize(data: unknown): void {
        if (!data || typeof data !== "object") {
            return;
        }

        const save = data as Partial<PlaceableSaveData>;
        if (typeof save.placementId === "string" || save.placementId === null) {
            this.placementId = save.placementId ?? null;
        }
        if (save.footprint) {
            this.footprint = {
                width: save.footprint.width ?? this.footprint.width,
                height: save.footprint.height ?? this.footprint.height,
            };
        }
        if (save.rotation === 0 || save.rotation === 90 || save.rotation === 180 || save.rotation === 270) {
            this.rotation = save.rotation;
        }
        if (typeof save.createPhysicsObstacle === "boolean") {
            this.createPhysicsObstacle = save.createPhysicsObstacle;
        }
        if (typeof save.blockTerrainCell === "boolean") {
            this.blockTerrainCell = save.blockTerrainCell;
        }
        if (typeof save.autoPlaceOnWorldJoin === "boolean") {
            this.autoPlaceOnWorldJoin = save.autoPlaceOnWorldJoin;
        }
        if (typeof save.placed === "boolean") {
            this.placed = save.placed;
        }
    }

    private getPlacementId(): string {
        return this.placementId ?? `placeable_${this.inst.GUID}`;
    }
}
