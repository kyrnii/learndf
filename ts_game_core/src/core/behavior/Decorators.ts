import { Entity } from "../Entity";
import { BehaviorNode, NodeStatus } from "./Node";

// 装饰器基类：包装单个子节点，对它的结果进行再加工。
export class DecoratorNode extends BehaviorNode {
    constructor(name: string, child: BehaviorNode) {
        super(name, [child]);
    }
}

// 非装饰器：把子节点的成功和失败结果反转。
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

// 运行即失败装饰器：如果子节点仍在运行，就把结果转成失败。
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

// 成功即失败装饰器：如果子节点成功，就把结果转成失败。
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
