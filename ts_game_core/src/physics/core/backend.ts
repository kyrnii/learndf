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
} from "./types";

export interface IPhysicsBackend {
    createWorld(config: PhysicsWorldConfig): PhysicsWorldId;
    destroyWorld(worldId: PhysicsWorldId): void;
    step(worldId: PhysicsWorldId, dt: number): void;

    createBody(worldId: PhysicsWorldId, desc: PhysicsBodyDesc): PhysicsBodyId;
    destroyBody(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): void;

    setBodyTransform(worldId: PhysicsWorldId, bodyId: PhysicsBodyId, transform: TransformLike): void;
    getBodyTransform(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): TransformLike;

    setLinearVelocity(worldId: PhysicsWorldId, bodyId: PhysicsBodyId, velocity: Vec3): void;
    getLinearVelocity(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): Vec3;

    moveKinematic(worldId: PhysicsWorldId, input: KinematicMoveInput): void;

    raycast(worldId: PhysicsWorldId, input: RaycastInput): RaycastHit | null;
    overlapSphere(worldId: PhysicsWorldId, input: OverlapSphereInput): OverlapHit[];
}
