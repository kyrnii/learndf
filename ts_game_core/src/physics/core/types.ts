export type PhysicsBodyId = number;
export type PhysicsWorldId = number;

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface TransformLike {
    position: Vec3;
    rotation?: Vec3;
}

export type PhysicsBodyType = "static" | "dynamic" | "kinematic";
export type PhysicsShapeType = "box" | "sphere" | "capsule";

export interface PhysicsLayerMask {
    group?: number;
    mask?: number;
}

export interface PhysicsShapeDesc {
    type: PhysicsShapeType;
    halfExtents?: Vec3;
    radius?: number;
    height?: number;
}

export interface PhysicsBodyDesc {
    type: PhysicsBodyType;
    transform: TransformLike;
    shape: PhysicsShapeDesc;
    layer?: PhysicsLayerMask;
    isTrigger?: boolean;
    userData?: unknown;
}

export interface PhysicsWorldConfig {
    gravity?: Vec3;
}

export interface RaycastInput {
    from: Vec3;
    to: Vec3;
    layerMask?: number;
}

export interface RaycastHit {
    point: Vec3;
    normal?: Vec3;
    distance: number;
    bodyId: PhysicsBodyId;
    userData?: unknown;
}

export interface OverlapSphereInput {
    center: Vec3;
    radius: number;
    layerMask?: number;
}

export interface OverlapHit {
    bodyId: PhysicsBodyId;
    userData?: unknown;
}

export interface KinematicMoveInput {
    bodyId: PhysicsBodyId;
    target: TransformLike;
}
