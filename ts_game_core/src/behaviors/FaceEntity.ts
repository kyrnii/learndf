import { Entity } from "../core/Entity";
import { BrainManager } from "../core/behavior/BrainManager";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { getTargetPosition, isAliveEntity } from "./utils";

export class FaceEntity extends BehaviorNode {
    private target: Entity | null = null;
    private startTime: number = 0;

    constructor(
        private getFn: (inst: Entity) => Entity | null,
        private keepFn: (inst: Entity, target: Entity) => boolean,
        private timeout?: number,
    ) {
        super("FaceEntity");
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY) {
            this.target = this.getFn(inst);
            if (!isAliveEntity(this.target)) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            inst.getComponent(Locomotor)?.stop();
            this.startTime = BrainManager.GLOBAL_TIME;
            this.status = NodeStatus.RUNNING;
        }

        if (!isAliveEntity(this.target) || !this.keepFn(inst, this.target)) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.timeout !== undefined && (BrainManager.GLOBAL_TIME - this.startTime) > this.timeout) {
            this.status = NodeStatus.SUCCESS;
            return;
        }

        const targetPos = getTargetPosition(this.target);
        if (!targetPos) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        inst.facePoint(targetPos.x, targetPos.z);
        this.status = NodeStatus.RUNNING;
        this.sleep(0.5);
    }
}
