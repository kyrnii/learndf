import { MapContext } from "./MapContext";
import { MapBounds } from "./layers";

// 兼容包装：保留旧的 WalkableMap 名称，内部使用新的 MapContext 结构。
export class WalkableMap extends MapContext {
    constructor(
        cellSize: number = 1,
        bounds: MapBounds = {
            minX: -Infinity,
            maxX: Infinity,
            minZ: -Infinity,
            maxZ: Infinity,
        },
    ) {
        super({
            id: "default",
            cellSize,
            bounds,
        });
    }

    public setBlockedWorld(x: number, z: number, blocked: boolean = true): void {
        this.setTerrainBlockedWorld(x, z, blocked);
    }
}
