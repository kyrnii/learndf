import { Entity } from "../../core/Entity";
import { Transform } from "../../components/Transform";
import { IPhysicsBackend } from "../core/backend";
import { PhysicsBody } from "../core/PhysicsBody";
import { PhysicsWorld } from "../core/PhysicsWorld";
import { EntityPhysics } from "./EntityPhysics";
import {
    OverlapHit,
    OverlapSphereInput,
    PhysicsBodyDesc,
    PhysicsWorldConfig,
    RaycastHit,
    RaycastInput,
    TransformLike,
    Vec3,
} from "../core/types";

export interface ObstacleOptions {
    entity?: Entity;
    transform: TransformLike;
    shape: PhysicsBodyDesc["shape"];
    layer?: PhysicsBodyDesc["layer"];
    userData?: unknown;
}

// 游戏侧统一物理入口：上层只依赖 Physics，不直接接触具体 backend。
export class Physics {
    private readonly world: PhysicsWorld;
    private readonly obstaclesByEntityGuid: Map<number, PhysicsBody> = new Map();
    private readonly entityBodies: Map<number, PhysicsBody> = new Map();

    constructor(
        private readonly backend: IPhysicsBackend,
        config: PhysicsWorldConfig = {},
    ) {
        const worldId = this.backend.createWorld(config);
        this.world = new PhysicsWorld(this.backend, worldId, config);
    }

    public step(dt: number): void {
        this.applyMotorVelocities(dt);
        this.world.step(dt);
    }

    public createBody(desc: PhysicsBodyDesc): PhysicsBody {
        return this.world.createBody(desc);
    }

    public destroyBody(body: PhysicsBody): void {
        this.world.destroyBody(body);
    }

    public addObstacle(options: ObstacleOptions): PhysicsBody {
        const body = this.world.createBody({
            type: "static",
            transform: options.transform,
            shape: options.shape,
            layer: options.layer,
            userData: options.userData ?? options.entity,
        });

        if (options.entity) {
            this.obstaclesByEntityGuid.set(options.entity.GUID, body);
        }

        return body;
    }

    public attach(entity: Entity, desc: PhysicsBodyDesc): EntityPhysics {
        const body = this.world.createBody({
            ...desc,
            userData: desc.userData ?? entity,
        });
        this.entityBodies.set(entity.GUID, body);

        const entityPhysics = new EntityPhysics(body);
        entity.setPhysics(entityPhysics);
        const transform = entity.getComponent(Transform);
        if (transform) {
            this.syncBodyToTransform(body, transform);
        }
        entity.listenForEvent("onremove", () => {
            this.detach(entity);
        });
        return entityPhysics;
    }

    public detach(entity: Entity): void {
        const body = this.entityBodies.get(entity.GUID);
        if (!body) {
            entity.setPhysics(null);
            return;
        }

        this.world.destroyBody(body);
        this.entityBodies.delete(entity.GUID);
        entity.setPhysics(null);
    }

    public removeObstacle(entity: Entity): void {
        const body = this.obstaclesByEntityGuid.get(entity.GUID);
        if (!body) {
            return;
        }

        this.world.destroyBody(body);
        this.obstaclesByEntityGuid.delete(entity.GUID);
    }

    public syncBodyToTransform(body: PhysicsBody, transform: Transform): void {
        body.setTransform({
            position: {
                x: transform.x,
                y: transform.y,
                z: transform.z,
            },
            rotation: {
                x: 0,
                y: transform.rotation,
                z: 0,
            },
        });
    }

    public syncTransformFromBody(body: PhysicsBody, transform: Transform): void {
        const physicsTransform = body.getTransform();
        transform.setPosition(
            physicsTransform.position.x,
            physicsTransform.position.y,
            physicsTransform.position.z,
        );
        if (physicsTransform.rotation) {
            transform.rotation = physicsTransform.rotation.y;
        }
    }

    public syncEntityFromPhysics(entity: Entity): void {
        const transform = entity.getComponent(Transform);
        const physics = entity.physics;
        if (!transform || !physics) {
            return;
        }

        this.syncTransformFromBody(physics.body, transform);
    }

    public syncEntityToPhysics(entity: Entity): void {
        const transform = entity.getComponent(Transform);
        const physics = entity.physics;
        if (!transform || !physics) {
            return;
        }

        this.syncBodyToTransform(physics.body, transform);
    }

    public setMotorVel(entityPhysics: EntityPhysics, x: number, y: number, z: number): void {
        entityPhysics.setMotorVel(x, y, z);
    }

    public stop(entityPhysics: EntityPhysics): void {
        entityPhysics.stop();
    }

    public moveKinematic(body: PhysicsBody, target: TransformLike): void {
        this.world.moveKinematic({
            bodyId: body.id,
            target,
        });
    }

    public setLinearVelocity(body: PhysicsBody, velocity: Vec3): void {
        body.setLinearVelocity(velocity);
    }

    public raycast(input: RaycastInput): RaycastHit | null {
        return this.world.raycast(input);
    }

    public overlapSphere(input: OverlapSphereInput): OverlapHit[] {
        return this.world.overlapSphere(input);
    }

    public destroy(): void {
        this.world.destroy();
        this.obstaclesByEntityGuid.clear();
        this.entityBodies.clear();
    }

    private applyMotorVelocities(dt: number): void {
        if (dt <= 0) {
            return;
        }

        for (const body of this.entityBodies.values()) {
            const owner = body.desc.userData;
            const entityPhysics = owner instanceof Entity ? owner.physics : null;
            if (!entityPhysics || body.desc.type !== "kinematic") {
                continue;
            }

            const motorVelocity = entityPhysics.getMotorVelocity();
            const speedSq = (motorVelocity.x * motorVelocity.x) + (motorVelocity.y * motorVelocity.y) + (motorVelocity.z * motorVelocity.z);
            if (speedSq <= 0) {
                continue;
            }

            const currentTransform = body.getTransform();
            this.moveKinematic(body, {
                position: {
                    x: currentTransform.position.x + motorVelocity.x * dt,
                    y: currentTransform.position.y + motorVelocity.y * dt,
                    z: currentTransform.position.z + motorVelocity.z * dt,
                },
                rotation: currentTransform.rotation,
            });
        }
    }
}
