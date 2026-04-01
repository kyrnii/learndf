import { IPhysicsBackend } from "./backend";
import { PhysicsBodyDesc, PhysicsBodyId, PhysicsWorldId, TransformLike, Vec3 } from "./types";

export class PhysicsBody {
    constructor(
        private readonly backend: IPhysicsBackend,
        private readonly worldId: PhysicsWorldId,
        public readonly id: PhysicsBodyId,
        public readonly desc: PhysicsBodyDesc,
    ) {}

    public setTransform(transform: TransformLike): void {
        this.backend.setBodyTransform(this.worldId, this.id, transform);
    }

    public getTransform(): TransformLike {
        return this.backend.getBodyTransform(this.worldId, this.id);
    }

    public setLinearVelocity(velocity: Vec3): void {
        this.backend.setLinearVelocity(this.worldId, this.id, velocity);
    }

    public getLinearVelocity(): Vec3 {
        return this.backend.getLinearVelocity(this.worldId, this.id);
    }
}
