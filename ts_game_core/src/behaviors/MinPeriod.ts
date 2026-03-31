import { Entity } from "../core/Entity";
import { BrainManager } from "../core/behavior/BrainManager";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";

export class MinPeriod extends BehaviorNode {
    private lastSuccessTime: number | null;

    constructor(private minPeriod: number, immediate: boolean, child: BehaviorNode) {
        super("MinPeriod", [child]);
        this.lastSuccessTime = immediate ? null : BrainManager.GLOBAL_TIME;
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY && this.lastSuccessTime !== null) {
            const elapsed = BrainManager.GLOBAL_TIME - this.lastSuccessTime;
            if (elapsed < this.minPeriod) {
                this.status = NodeStatus.FAILURE;
                return;
            }
        }

        const child = this.children![0];
        child.visit(inst);

        if (child.status === NodeStatus.SUCCESS) {
            this.lastSuccessTime = BrainManager.GLOBAL_TIME;
        }

        this.status = child.status;
    }
}
