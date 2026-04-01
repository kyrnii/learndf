import { PhysicsBody } from "../core/PhysicsBody";

// 实体级物理句柄：挂在 Entity 上，表示该实体拥有的原生物理能力引用。
export class EntityPhysics {
    private motorVelocity = { x: 0, y: 0, z: 0 };

    constructor(
        public readonly body: PhysicsBody,
    ) {}

    public setMotorVel(x: number, y: number, z: number): void {
        this.motorVelocity = { x, y, z };
    }

    public getMotorVelocity(): { x: number; y: number; z: number } {
        return { ...this.motorVelocity };
    }

    public getMotorSpeed(): number {
        const { x, y, z } = this.motorVelocity;
        return Math.sqrt((x * x) + (y * y) + (z * z));
    }

    public stop(): void {
        this.motorVelocity = { x: 0, y: 0, z: 0 };
    }

    public getRadius(): number {
        switch (this.body.desc.shape.type) {
            case "sphere":
                return this.body.desc.shape.radius ?? 0.5;
            case "capsule":
                return this.body.desc.shape.radius ?? 0.5;
            case "box":
                return Math.max(
                    this.body.desc.shape.halfExtents?.x ?? 0.5,
                    this.body.desc.shape.halfExtents?.z ?? 0.5,
                );
            default:
                return 0.5;
        }
    }
}
