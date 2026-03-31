import { Component } from "../core/Component";
import { Entity } from "../core/Entity";

export class Transform extends Component {
    public x: number = 0;
    public y: number = 0;
    public z: number = 0;
    public rotation: number = 0;

    public setPosition(x: number, y: number, z: number): void {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public getDistanceSqToPoint(tx: number, tz: number): number {
        const dx = this.x - tx;
        const dz = this.z - tz;
        return dx * dx + dz * dz;
    }

    public getDistanceSqToInst(target: Entity): number | null {
        const targetTransform = target.getComponent(Transform);
        if (!targetTransform) return null;
        return this.getDistanceSqToPoint(targetTransform.x, targetTransform.z);
    }

    public facePoint(tx: number, tz: number): void {
        const dx = tx - this.x;
        const dz = tz - this.z;
        this.rotation = Math.atan2(dz, dx);
    }
}
