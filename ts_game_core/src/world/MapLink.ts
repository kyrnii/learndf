// 地图连接：描述两个地图实例之间的出入口关系，便于后续做门、楼梯、传送点。
export interface MapLink {
    id: string;
    fromMapId: string;
    toMapId: string;
    from: { x: number; z: number };
    to: { x: number; z: number };
}
