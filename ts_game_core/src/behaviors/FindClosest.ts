import { Entity } from "../core/Entity";
import { TagQuery } from "../core/Tags";
import { BrainManager } from "../core/behavior/BrainManager";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { Transform } from "../components/Transform";
import { resolveValue, ValueOrFn } from "./utils";

const CHECK_INTERVAL = 5;

// 搜索并靠近最近的目标，直到与目标保持在一个安全距离内。
export class FindClosest extends BehaviorNode {
    private target: Entity | null = null;
    private lastCheckTime: number = 0;

    constructor(
        private seeDist: number,
        private safeDist: ValueOrFn<number>,
        private includeTags?: TagQuery,
        private excludeTags?: TagQuery,
        private oneOfTags?: TagQuery,
    ) {
        super("FindClosest");
    }

    private isValidTarget(inst: Entity, entity: Entity | null): entity is Entity {
        if (!entity || !entity.isValid || entity === inst) {
            return false;
        }

        if (this.includeTags !== undefined && !entity.hasAllTags(this.includeTags)) {
            return false;
        }

        if (this.excludeTags !== undefined && entity.hasAnyTag(this.excludeTags)) {
            return false;
        }

        if (this.oneOfTags !== undefined && !entity.hasAnyTag(this.oneOfTags)) {
            return false;
        }

        return true;
    }

    private pickTarget(inst: Entity): void {
        this.target = inst.world?.findClosestEntityFromInst(
            inst,
            this.seeDist,
            (entity) => this.isValidTarget(inst, entity),
        ) ?? null;
        this.lastCheckTime = BrainManager.GLOBAL_TIME;
    }

    public visit(inst: Entity): void {
        const locomotor = inst.getComponent(Locomotor);
        const transform = inst.getComponent(Transform);
        if (!locomotor || !transform || !inst.world) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.status === NodeStatus.READY) {
            this.pickTarget(inst);
            this.status = NodeStatus.RUNNING;
        }

        if ((BrainManager.GLOBAL_TIME - this.lastCheckTime) > CHECK_INTERVAL) {
            this.pickTarget(inst);
        } else if (!this.isValidTarget(inst, this.target)) {
            this.target = null;
        }

        if (!this.target) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        const targetTransform = this.target.getComponent(Transform);
        if (!targetTransform) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        const actualSafeDist = resolveValue(this.safeDist, inst);
        const distSq = transform.getDistanceSqToPoint(targetTransform.x, targetTransform.z);
        if (distSq <= actualSafeDist * actualSafeDist) {
            locomotor.stop();
            this.status = NodeStatus.SUCCESS;
            return;
        }

        const dx = transform.x - targetTransform.x;
        const dz = transform.z - targetTransform.z;
        const len = Math.sqrt((dx * dx) + (dz * dz)) || 1;
        locomotor.goToPoint(
            {
                x: targetTransform.x + (dx / len) * (actualSafeDist * 0.98),
                z: targetTransform.z + (dz / len) * (actualSafeDist * 0.98),
            },
            true,
        );

        this.status = NodeStatus.RUNNING;
        this.sleep(0.25);
    }
}
