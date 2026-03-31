import { Entity } from "../core/Entity";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { Transform } from "../components/Transform";
import { getDistanceSq, getTargetPosition, isAliveEntity, resolveValue, ValueOrFn } from "./utils";

export class Follow extends BehaviorNode {
    private currentTarget: Entity | null = null;
    private action: "APPROACH" | "BACKOFF" | null = null;

    constructor(
        private target: ValueOrFn<Entity | null>,
        private minDist: ValueOrFn<number>,
        private targetDist: ValueOrFn<number>,
        private maxDist: ValueOrFn<number>,
        private canRun: boolean = true,
    ) {
        super("Follow");
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY) {
            this.currentTarget = resolveValue(this.target, inst);
            this.action = null;

            if (!isAliveEntity(this.currentTarget)) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            const distSq = getDistanceSq(inst, this.currentTarget);
            if (distSq === null) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            const minDist = resolveValue(this.minDist, inst);
            const maxDist = resolveValue(this.maxDist, inst);

            if (distSq < minDist * minDist) {
                this.action = "BACKOFF";
                this.status = NodeStatus.RUNNING;
            } else if (distSq > maxDist * maxDist) {
                this.action = "APPROACH";
                this.status = NodeStatus.RUNNING;
            } else {
                this.status = NodeStatus.FAILURE;
            }
        }

        if (!isAliveEntity(this.currentTarget)) {
            inst.getComponent(Locomotor)?.stop();
            this.status = NodeStatus.FAILURE;
            return;
        }

        const locomotor = inst.getComponent(Locomotor);
        const selfTransform = inst.getComponent(Transform);
        const targetPos = getTargetPosition(this.currentTarget);
        const distSq = getDistanceSq(inst, this.currentTarget);

        if (!locomotor || !selfTransform || !targetPos || distSq === null || !this.action) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        const targetDist = resolveValue(this.targetDist, inst);

        if (this.action === "APPROACH") {
            if (distSq <= targetDist * targetDist) {
                locomotor.stop();
                this.status = NodeStatus.SUCCESS;
                return;
            }

            locomotor.goToPoint(targetPos, this.canRun, targetDist);
        } else {
            if (distSq >= targetDist * targetDist) {
                locomotor.stop();
                this.status = NodeStatus.SUCCESS;
                return;
            }

            const dx = selfTransform.x - targetPos.x;
            const dz = selfTransform.z - targetPos.z;
            const len = Math.sqrt((dx * dx) + (dz * dz)) || 1;
            locomotor.goToPoint(
                {
                    x: selfTransform.x + (dx / len) * targetDist,
                    z: selfTransform.z + (dz / len) * targetDist,
                },
                this.canRun,
            );
        }

        this.status = NodeStatus.RUNNING;
        this.sleep(0.25);
    }
}
