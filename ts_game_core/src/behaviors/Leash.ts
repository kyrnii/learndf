import { Entity } from "../core/Entity";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { Transform } from "../components/Transform";
import { resolveValue, ValueOrFn } from "./utils";

// 拴绳节点：实体离 home 太远时被拉回指定区域，常用于怪物守家或巡逻圈限制。
export class Leash extends BehaviorNode {
    constructor(
        private homePos: ValueOrFn<{ x: number; z: number } | null>,
        private maxDist: ValueOrFn<number>,
        private returnDist: ValueOrFn<number>,
        private running: ValueOrFn<boolean> = false,
    ) {
        super("Leash");
    }

    private getDistFromHomeSq(inst: Entity, home: { x: number; z: number }): number | null {
        const transform = inst.getComponent(Transform);
        if (!transform) {
            return null;
        }
        return transform.getDistanceSqToPoint(home.x, home.z);
    }

    public visit(inst: Entity): void {
        const home = resolveValue(this.homePos, inst);
        const locomotor = inst.getComponent(Locomotor);

        if (!home || !locomotor) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        const distSq = this.getDistFromHomeSq(inst, home);
        if (distSq === null) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.status === NodeStatus.READY) {
            const maxDist = resolveValue(this.maxDist, inst);
            if (distSq < maxDist * maxDist) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            locomotor.stop();
            this.status = NodeStatus.RUNNING;
        }

        const returnDist = resolveValue(this.returnDist, inst);
        if (distSq > returnDist * returnDist) {
            locomotor.goToPoint(home, resolveValue(this.running, inst));
            this.status = NodeStatus.RUNNING;
            this.sleep(0.1);
        } else {
            locomotor.stop();
            this.status = NodeStatus.SUCCESS;
        }
    }
}
