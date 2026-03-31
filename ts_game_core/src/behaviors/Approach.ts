import { Entity } from "../core/Entity";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { getDistanceSq, getTargetPosition, isAliveEntity, resolveValue, ValueOrFn } from "./utils";

export class Approach extends BehaviorNode {
    private currentTarget: Entity | null = null;

    constructor(
        private target: ValueOrFn<Entity | null>,
        private dist: ValueOrFn<number>,
        private canRun: boolean = true,
    ) {
        super("Approach");
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY) {
            this.currentTarget = resolveValue(this.target, inst);
            if (!isAliveEntity(this.currentTarget)) {
                this.status = NodeStatus.FAILURE;
                return;
            }
        }

        if (!isAliveEntity(this.currentTarget)) {
            inst.getComponent(Locomotor)?.stop();
            this.status = NodeStatus.FAILURE;
            return;
        }

        const distance = resolveValue(this.dist, inst);
        const distSq = getDistanceSq(inst, this.currentTarget);
        const targetPos = getTargetPosition(this.currentTarget);
        const locomotor = inst.getComponent(Locomotor);

        if (distSq === null || !targetPos || !locomotor) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (distSq <= distance * distance) {
            locomotor.stop();
            this.status = NodeStatus.SUCCESS;
            return;
        }

        locomotor.goToPoint(targetPos, this.canRun, distance);
        this.status = NodeStatus.RUNNING;
        this.sleep(0.25);
    }
}
