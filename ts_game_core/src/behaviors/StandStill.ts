import { Entity } from "../core/Entity";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";

export class StandStill extends BehaviorNode {
    constructor(
        private startFn?: (inst: Entity) => boolean,
        private keepFn?: (inst: Entity) => boolean,
    ) {
        super("StandStill");
    }

    public visit(inst: Entity): void {
        const locomotor = inst.getComponent(Locomotor);

        if (this.status === NodeStatus.READY) {
            if (this.startFn && !this.startFn(inst)) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            locomotor?.stop();
            this.status = NodeStatus.RUNNING;
        }

        if (this.status === NodeStatus.RUNNING) {
            if (this.keepFn && !this.keepFn(inst)) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            locomotor?.stop();
            this.sleep(0.5);
        }
    }
}
