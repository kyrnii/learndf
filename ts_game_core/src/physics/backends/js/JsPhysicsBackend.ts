import RAPIER from "@dimforge/rapier3d-compat";
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

type RapierWorld = RAPIER.World;
type RapierRigidBody = RAPIER.RigidBody;
type RapierCollider = RAPIER.Collider;

interface RapierBodyState {
    desc: PhysicsBodyDesc;
    body: RapierRigidBody;
    collider: RapierCollider;
    userData?: unknown;
}

interface RapierWorldState {
    world: RapierWorld;
    bodies: Map<PhysicsBodyId, RapierBodyState>;
}

// JS Rapier 后端：为上层 Physics 提供统一接口，内部使用 Rapier WASM 世界实现。
export class JsPhysicsBackend implements IPhysicsBackend {
    private nextWorldId: PhysicsWorldId = 1;
    private worlds: Map<PhysicsWorldId, RapierWorldState> = new Map();

    private constructor() {}

    public static async create(): Promise<JsPhysicsBackend> {
        await RAPIER.init();
        return new JsPhysicsBackend();
    }

    public createWorld(config: PhysicsWorldConfig): PhysicsWorldId {
        const id = this.nextWorldId++;
        const gravity = config.gravity ?? { x: 0, y: -9.81, z: 0 };
        const world = new RAPIER.World(new RAPIER.Vector3(gravity.x, gravity.y, gravity.z));
        this.worlds.set(id, {
            world,
            bodies: new Map(),
        });
        return id;
    }

    public destroyWorld(worldId: PhysicsWorldId): void {
        const state = this.worlds.get(worldId);
        if (!state) {
            return;
        }

        state.world.free();
        this.worlds.delete(worldId);
    }

    public step(worldId: PhysicsWorldId, dt: number): void {
        const state = this.requireWorld(worldId);
        state.world.timestep = dt;
        state.world.step();
    }

    public createBody(worldId: PhysicsWorldId, desc: PhysicsBodyDesc): PhysicsBodyId {
        const state = this.requireWorld(worldId);
        const bodyDesc = this.createRigidBodyDesc(desc);
        const body = state.world.createRigidBody(bodyDesc);
        const colliderDesc = this.createColliderDesc(desc);
        const collider = state.world.createCollider(colliderDesc, body);
        const bodyId = body.handle;

        state.bodies.set(bodyId, {
            desc,
            body,
            collider,
            userData: desc.userData,
        });

        return bodyId;
    }

    public destroyBody(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): void {
        const state = this.requireWorld(worldId);
        const bodyState = state.bodies.get(bodyId);
        if (!bodyState) {
            return;
        }

        state.world.removeRigidBody(bodyState.body);
        state.bodies.delete(bodyId);
    }

    public setBodyTransform(worldId: PhysicsWorldId, bodyId: PhysicsBodyId, transform: TransformLike): void {
        const body = this.requireBody(worldId, bodyId).body;
        body.setTranslation(this.toRapierVector(transform.position), true);
        body.setRotation(this.toRapierRotation(transform.rotation), true);
    }

    public getBodyTransform(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): TransformLike {
        const body = this.requireBody(worldId, bodyId).body;
        const translation = body.translation();
        const rotation = body.rotation();
        return {
            position: {
                x: translation.x,
                y: translation.y,
                z: translation.z,
            },
            rotation: this.toEulerLikeRotation(rotation),
        };
    }

    public setLinearVelocity(worldId: PhysicsWorldId, bodyId: PhysicsBodyId, velocity: Vec3): void {
        const body = this.requireBody(worldId, bodyId).body;
        body.setLinvel(this.toRapierVector(velocity), true);
    }

    public getLinearVelocity(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): Vec3 {
        const velocity = this.requireBody(worldId, bodyId).body.linvel();
        return { x: velocity.x, y: velocity.y, z: velocity.z };
    }

    public moveKinematic(worldId: PhysicsWorldId, input: KinematicMoveInput): void {
        const body = this.requireBody(worldId, input.bodyId).body;
        body.setNextKinematicTranslation(this.toRapierVector(input.target.position));
        body.setNextKinematicRotation(this.toRapierRotation(input.target.rotation));
    }

    public raycast(worldId: PhysicsWorldId, input: RaycastInput): RaycastHit | null {
        const state = this.requireWorld(worldId);
        const direction = {
            x: input.to.x - input.from.x,
            y: input.to.y - input.from.y,
            z: input.to.z - input.from.z,
        };
        const maxToi = Math.sqrt((direction.x ** 2) + (direction.y ** 2) + (direction.z ** 2));
        if (maxToi <= 0) {
            return null;
        }

        const ray = new RAPIER.Ray(
            this.toRapierVector(input.from),
            this.toRapierVector({
                x: direction.x / maxToi,
                y: direction.y / maxToi,
                z: direction.z / maxToi,
            }),
        );

        const hit = state.world.castRayAndGetNormal(ray, maxToi, true);
        if (!hit) {
            return null;
        }

        return {
            point: {
                x: ray.origin.x + (ray.dir.x * hit.timeOfImpact),
                y: ray.origin.y + (ray.dir.y * hit.timeOfImpact),
                z: ray.origin.z + (ray.dir.z * hit.timeOfImpact),
            },
            normal: {
                x: hit.normal.x,
                y: hit.normal.y,
                z: hit.normal.z,
            },
            distance: hit.timeOfImpact,
            bodyId: hit.collider.parent()?.handle ?? hit.collider.handle,
            userData: this.findUserData(state, hit.collider.parent()?.handle ?? hit.collider.handle),
        };
    }

    public overlapSphere(worldId: PhysicsWorldId, input: OverlapSphereInput): OverlapHit[] {
        const state = this.requireWorld(worldId);
        const hits: OverlapHit[] = [];
        const shape = new RAPIER.Ball(input.radius);

        state.world.intersectionsWithShape(
            this.toRapierVector(input.center),
            RAPIER.RotationOps.identity(),
            shape,
            (collider) => {
                const bodyId = collider.parent()?.handle ?? collider.handle;
                hits.push({
                    bodyId,
                    userData: this.findUserData(state, bodyId),
                });
                return true;
            },
        );

        return hits;
    }

    private createRigidBodyDesc(desc: PhysicsBodyDesc): RAPIER.RigidBodyDesc {
        let bodyDesc: RAPIER.RigidBodyDesc;
        switch (desc.type) {
            case "dynamic":
                bodyDesc = RAPIER.RigidBodyDesc.dynamic();
                break;
            case "kinematic":
                bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
                break;
            default:
                bodyDesc = RAPIER.RigidBodyDesc.fixed();
                break;
        }

        bodyDesc.setTranslation(
            desc.transform.position.x,
            desc.transform.position.y,
            desc.transform.position.z,
        );
        bodyDesc.setRotation(this.toRapierRotation(desc.transform.rotation));
        return bodyDesc;
    }

    private createColliderDesc(desc: PhysicsBodyDesc): RAPIER.ColliderDesc {
        let colliderDesc: RAPIER.ColliderDesc;
        switch (desc.shape.type) {
            case "sphere":
                colliderDesc = RAPIER.ColliderDesc.ball(desc.shape.radius ?? 0.5);
                break;
            case "capsule":
                colliderDesc = RAPIER.ColliderDesc.capsule(
                    (desc.shape.height ?? 1) * 0.5,
                    desc.shape.radius ?? 0.5,
                );
                break;
            default: {
                const halfExtents = desc.shape.halfExtents ?? { x: 0.5, y: 0.5, z: 0.5 };
                colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
                break;
            }
        }

        if (desc.isTrigger) {
            colliderDesc.setSensor(true);
        }

        if (desc.layer) {
            const group = desc.layer.group ?? 0xffff;
            const mask = desc.layer.mask ?? 0xffff;
            const interactionGroups = ((group & 0xffff) << 16) | (mask & 0xffff);
            colliderDesc.setCollisionGroups(interactionGroups);
            colliderDesc.setSolverGroups(interactionGroups);
        }

        return colliderDesc;
    }

    private toRapierVector(v: Vec3): RAPIER.Vector3 {
        return new RAPIER.Vector3(v.x, v.y, v.z);
    }

    private toRapierRotation(rotation?: Vec3): RAPIER.Quaternion {
        const yaw = rotation?.y ?? 0;
        const halfYaw = yaw * 0.5;
        return new RAPIER.Quaternion(0, Math.sin(halfYaw), 0, Math.cos(halfYaw));
    }

    private toEulerLikeRotation(rotation: RAPIER.Rotation): Vec3 {
        const sinyCosp = 2 * ((rotation.w * rotation.y) + (rotation.x * rotation.z));
        const cosyCosp = 1 - (2 * ((rotation.y * rotation.y) + (rotation.z * rotation.z)));
        return {
            x: 0,
            y: Math.atan2(sinyCosp, cosyCosp),
            z: 0,
        };
    }

    private findUserData(state: RapierWorldState, bodyId: PhysicsBodyId): unknown {
        return state.bodies.get(bodyId)?.userData;
    }

    private requireWorld(worldId: PhysicsWorldId): RapierWorldState {
        const state = this.worlds.get(worldId);
        if (!state) {
            throw new Error(`Physics world ${worldId} not found.`);
        }
        return state;
    }

    private requireBody(worldId: PhysicsWorldId, bodyId: PhysicsBodyId): RapierBodyState {
        const state = this.requireWorld(worldId);
        const body = state.bodies.get(bodyId);
        if (!body) {
            throw new Error(`Physics body ${bodyId} not found in world ${worldId}.`);
        }
        return body;
    }
}
