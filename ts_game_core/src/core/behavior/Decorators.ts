import { Entity } from "../Entity";
import { BehaviorNode, NodeStatus } from "./Node";

export class DecoratorNode extends BehaviorNode {
    constructor(name: string, child: BehaviorNode) {
        super(name, [child]);
    }
}

export class NotDecorator extends DecoratorNode {
    constructor(child: BehaviorNode) {
        super("Not", child);
    }

    public visit(inst: Entity): void {
        const child = this.children![0];
        child.visit(inst);

        if (child.status === NodeStatus.SUCCESS) {
            this.status = NodeStatus.FAILURE;
        } else if (child.status === NodeStatus.FAILURE) {
            this.status = NodeStatus.SUCCESS;
        } else {
            this.status = child.status;
        }
    }
}

export class FailIfRunningDecorator extends DecoratorNode {
    constructor(child: BehaviorNode) {
        super("FailIfRunning", child);
    }

    public visit(inst: Entity): void {
        const child = this.children![0];
        child.visit(inst);

        if (child.status === NodeStatus.RUNNING) {
            this.status = NodeStatus.FAILURE;
        } else {
            this.status = child.status;
        }
    }
}

export class FailIfSuccessDecorator extends DecoratorNode {
    constructor(child: BehaviorNode) {
        super("FailIfSuccess", child);
    }

    public visit(inst: Entity): void {
        const child = this.children![0];
        child.visit(inst);

        if (child.status === NodeStatus.SUCCESS) {
            this.status = NodeStatus.FAILURE;
        } else {
            this.status = child.status;
        }
    }
}
