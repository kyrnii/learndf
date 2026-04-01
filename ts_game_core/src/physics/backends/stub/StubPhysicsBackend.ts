import { IPhysicsBackend } from "../../core/backend";
import {
    KinematicMoveInput,
    OverlapHit,
    OverlapSphereInput,
    PhysicsBodyDesc,
    PhysicsBodyId,
    PhysicsWorldConfig,
    PhysicsWorldId,
    RaycastHit,
    RaycastInput,
    TransformLike,
    Vec3,
} from "../../core/types";

interface StubWorldState {
    config: PhysicsWorldConfig;
    bodies: Map<PhysicsBodyId, PhysicsBodyDesc>;
    transforms: Map<PhysicsBodyId, TransformLike>;
    velocities: Map<PhysicsBodyId, Vec3>;
}

// 纯内存后端：用于当前阶段的接口联调和单元逻辑验证，不提供真实碰撞求解。
export class StubPhysicsBackend implements IPhysicsBackend {
    private nextWorldId: PhysicsWorldId = 1;
    private nextBodyId: PhysicsBodyId = 1;
    private worlds: Map<PhysicsWorldId, StubWorldState> = new Map();

    public createWorld(config: PhysicsWorldConfig): PhysicsWorldId {
        const id = this.nextWorldId++;
        this.worlds.set(id, {
            config,
            bodies: new Map(),
            transforms: new Map(),
            velocities: new Map(),
        });
        return id;
    }

    public destroyWorld(worldId: PhysicsWorldId): void {
        this.worlds.delete(worldId);
    }

    public step(_worldId: PhysicsWorldId, _dt: number): void {}

    public createBody(worldId: PhysicsWorldId, desc: PhysicsBodyDesc): PhysicsBodyId {
        const world = this.requireWorld(worldId);
        const bodyId = this.nextBodyId++;
        world.bodies.set(bodyId, desc);
        world.transforms.set(bodyId, desc.transform);
        world.velocities.set(bodyId, { x: 0, y: 0, z: 0 });
        return bodyId;
    }

    public destroyBody(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): void {
        const world = this.requireWorld(worldId);
        world.bodies.delete(bodyId);
        world.transforms.delete(bodyId);
        world.velocities.delete(bodyId);
    }

    public setBodyTransform(worldId: PhysicsWorldId, bodyId: PhysicsBodyId, transform: TransformLike): void {
        this.requireBody(worldId, bodyId);
        this.requireWorld(worldId).transforms.set(bodyId, transform);
    }

    public getBodyTransform(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): TransformLike {
        const transform = this.requireWorld(worldId).transforms.get(bodyId);
        if (!transform) {
            throw new Error(`Physics body ${bodyId} not found in world ${worldId}.`);
        }
        return transform;
    }

    public setLinearVelocity(worldId: PhysicsWorldId, bodyId: PhysicsBodyId, velocity: Vec3): void {
        this.requireBody(worldId, bodyId);
        this.requireWorld(worldId).velocities.set(bodyId, velocity);
    }

    public getLinearVelocity(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): Vec3 {
        return this.requireWorld(worldId).velocities.get(bodyId) ?? { x: 0, y: 0, z: 0 };
    }

    public moveKinematic(worldId: PhysicsWorldId, input: KinematicMoveInput): void {
        const current = this.getBodyTransform(worldId, input.bodyId);
        this.setBodyTransform(worldId, input.bodyId, {
            ...current,
            ...input.target,
        });
    }

    public raycast(_worldId: PhysicsWorldId, _input: RaycastInput): RaycastHit | null {
        return null;
    }

    public overlapSphere(_worldId: PhysicsWorldId, _input: OverlapSphereInput): OverlapHit[] {
        return [];
    }

    private requireWorld(worldId: PhysicsWorldId): StubWorldState {
        const world = this.worlds.get(worldId);
        if (!world) {
            throw new Error(`Physics world ${worldId} not found.`);
        }
        return world;
    }

    private requireBody(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): void {
        if (!this.requireWorld(worldId).bodies.has(bodyId)) {
            throw new Error(`Physics body ${bodyId} not found in world ${worldId}.`);
        }
    }
}
