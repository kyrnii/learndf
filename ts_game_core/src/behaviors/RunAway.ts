import { Entity } from "../core/Entity";
import { TagQuery } from "../core/Tags";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { Transform } from "../components/Transform";
import { findWalkableOffset } from "../world";
import { isAliveEntity, resolveValue, ValueOrFn } from "./utils";

export interface RunAwayHunterOptions {
    finder?: (inst: Entity) => Entity | null;
    tags?: TagQuery;
    excludeTags?: TagQuery;
    oneOfTags?: TagQuery;
}

// 逃离猎手节点：发现威胁后沿远离方向寻找可走点撤离，直到脱离安全距离。
export class RunAway extends BehaviorNode {
    private hunter: Entity | null = null;

    constructor(
        private hunterOptions: RunAwayHunterOptions,
        private seeDist: number,
        private safeDist: ValueOrFn<number>,
        private shouldRunFn?: (hunter: Entity, inst: Entity) => boolean,
        private walkInstead: boolean = false,
        private safePointFn?: (inst: Entity) => { x: number; z: number } | null,
    ) {
        super("RunAway");
    }

    private isValidHunter(inst: Entity, entity: Entity | null): entity is Entity {
        if (!entity || !entity.isValid || entity === inst) {
            return false;
        }

        if (this.hunterOptions.tags !== undefined && !entity.hasAllTags(this.hunterOptions.tags)) {
            return false;
        }

        if (this.hunterOptions.excludeTags !== undefined && entity.hasAnyTag(this.hunterOptions.excludeTags)) {
            return false;
        }

        if (this.hunterOptions.oneOfTags !== undefined && !entity.hasAnyTag(this.hunterOptions.oneOfTags)) {
            return false;
        }

        return true;
    }

    private findHunter(inst: Entity): Entity | null {
        if (this.hunterOptions.finder) {
            const target = this.hunterOptions.finder(inst);
            return this.isValidHunter(inst, target) ? target : null;
        }

        return inst.world?.findClosestEntityFromInst(
            inst,
            this.seeDist,
            (entity) => this.isValidHunter(inst, entity),
        ) ?? null;
    }

    public visit(inst: Entity): void {
        const locomotor = inst.getComponent(Locomotor);
        const transform = inst.getComponent(Transform);
        if (!locomotor || !transform) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.status === NodeStatus.READY) {
            this.hunter = this.findHunter(inst);
            if (this.hunter && this.shouldRunFn && !this.shouldRunFn(this.hunter, inst)) {
                this.hunter = null;
            }

            this.status = this.hunter ? NodeStatus.RUNNING : NodeStatus.FAILURE;
        }

        if (!isAliveEntity(this.hunter)) {
            locomotor.stop();
            this.status = NodeStatus.FAILURE;
            return;
        }

        const hunterTransform = this.hunter.getComponent(Transform);
        if (!hunterTransform) {
            locomotor.stop();
            this.status = NodeStatus.FAILURE;
            return;
        }

        const safeDistance = resolveValue(this.safeDist, inst);
        const distSq = transform.getDistanceSqToPoint(hunterTransform.x, hunterTransform.z);
        if (distSq > safeDistance * safeDistance) {
            locomotor.stop();
            this.status = NodeStatus.SUCCESS;
            return;
        }

        const safePoint = this.safePointFn?.(inst) ?? null;
        let angle = Math.atan2(transform.z - hunterTransform.z, transform.x - hunterTransform.x);
        if (safePoint) {
            const awayX = transform.x - hunterTransform.x;
            const awayZ = transform.z - hunterTransform.z;
            const safeX = safePoint.x - transform.x;
            const safeZ = safePoint.z - transform.z;
            angle = Math.atan2((awayZ + safeZ) * 0.5, (awayX + safeX) * 0.5);
        }

        const destination = findWalkableOffset(inst, angle, 6, 8) ?? {
            x: transform.x + Math.cos(angle) * 6,
            z: transform.z + Math.sin(angle) * 6,
        };

        locomotor.goToPoint(destination, !this.walkInstead);
        this.status = NodeStatus.RUNNING;
        this.sleep(0.25);
    }
}
