import { BufferedAction } from "../core/Action";
import { Entity } from "../core/Entity";
import { BrainManager } from "../core/behavior/BrainManager";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";

export class DoAction extends BehaviorNode {
    private action: BufferedAction | null = null;
    private pendingStatus: NodeStatus | null = null;
    private startTime: number | null = null;

    constructor(
        private getActionFn: (inst: Entity) => BufferedAction | null,
        name: string = "DoAction",
        private timeout?: number,
    ) {
        super(name);
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY) {
            const action = this.getActionFn(inst);
            this.action = action;
            this.pendingStatus = null;
            this.startTime = null;

            if (!action) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            action.addFailAction(() => {
                if (this.action === action && this.pendingStatus === null) {
                    this.pendingStatus = NodeStatus.FAILURE;
                }
            });
            action.addSuccessAction(() => {
                if (this.action === action) {
                    this.pendingStatus = NodeStatus.SUCCESS;
                }
            });

            const locomotor = inst.getComponent(Locomotor);
            if (!locomotor) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            locomotor.pushAction(action);
            this.startTime = BrainManager.GLOBAL_TIME;
            this.status = NodeStatus.RUNNING;
        }

        if (this.status === NodeStatus.RUNNING) {
            if (this.timeout !== undefined
                && this.startTime !== null
                && (BrainManager.GLOBAL_TIME - this.startTime) > this.timeout) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            if (this.pendingStatus !== null) {
                this.status = this.pendingStatus;
                return;
            }

            if (!this.action || !this.action.doer.isValid) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            this.sleep(0.1);
        }
    }
}
