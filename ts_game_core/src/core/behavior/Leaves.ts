import { Entity } from "../Entity";
import { BehaviorNode, NodeStatus } from "./Node";
import { BufferedAction } from "../Action";
import { Locomotor } from "../../components/Locomotor";
import { BrainManager } from "./BrainManager";
import { PriorityNode } from "./Composites";

// 条件叶子节点：根据传入条件函数返回成功或失败。
export class ConditionNode extends BehaviorNode {
    constructor(private conditionFn: (inst: Entity) => boolean, name: string = "Condition") {
        super(name);
    }

    public visit(inst: Entity): void {
        if (this.conditionFn(inst)) {
            this.status = NodeStatus.SUCCESS;
        } else {
            this.status = NodeStatus.FAILURE;
        }
    }
}

// 动作叶子节点：生成并发起一个 BufferedAction，等待动作完成结果。
export class ActionNode extends BehaviorNode {
    private action: BufferedAction | null = null;
    private pendingStatus: NodeStatus | null = null;
    
    constructor(private actionGenerator: (inst: Entity) => BufferedAction | null, name: string = "Action") {
        super(name);
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY) {
            const action = this.actionGenerator(inst);
            this.action = action;
            this.pendingStatus = null;

            if (action) {
                action.addSuccessAction(() => {
                    if (this.action === action) {
                        this.pendingStatus = NodeStatus.SUCCESS;
                    }
                });
                action.addFailAction(() => {
                    if (this.action === action && this.pendingStatus === null) {
                        this.pendingStatus = NodeStatus.FAILURE;
                    }
                });

                const locomotor = inst.getComponent(Locomotor);
                if (locomotor) {
                    locomotor.pushAction(action);
                    this.status = NodeStatus.RUNNING;
                } else {
                    this.status = NodeStatus.FAILURE;
                }
            } else {
                this.status = NodeStatus.FAILURE;
            }
        }

        if (this.status === NodeStatus.RUNNING) {
            if (this.pendingStatus !== null) {
                this.status = this.pendingStatus;
            }
        }
    }
}

// 等待叶子节点：在一段时间后返回成功。
export class WaitNode extends BehaviorNode {
    private waitNodeWakeTime: number = 0;

    constructor(private waitTime: number, name: string = "Wait") {
        super(name);
    }

    public getSleepTime(): number | null {
        if (this.status === NodeStatus.RUNNING) {
            return Math.max(0, this.waitNodeWakeTime - BrainManager.GLOBAL_TIME);
        }
        return null;
    }

    public visit(inst: Entity): void {
        const currentTime = BrainManager.GLOBAL_TIME;

        if (this.status !== NodeStatus.RUNNING) {
            this.waitNodeWakeTime = currentTime + this.waitTime;
            this.status = NodeStatus.RUNNING;
        }

        if (this.status === NodeStatus.RUNNING) {
            if (currentTime >= this.waitNodeWakeTime) {
                this.status = NodeStatus.SUCCESS;
            }
        }
    }
}

// 多阶段条件节点：首次使用 startFn，后续使用 continueFn 维持状态。
export class MultiConditionNode extends BehaviorNode {
    private isRunning: boolean = false;

    constructor(private startFn: (inst: Entity) => boolean, private continueFn: (inst: Entity) => boolean, name: string = "MultiCondition") {
        super(name);
    }

    public visit(inst: Entity): void {
        if (!this.isRunning) {
            this.isRunning = this.startFn(inst);
        } else {
            this.isRunning = this.continueFn(inst);
        }

        if (this.isRunning) {
            this.status = NodeStatus.SUCCESS;
        } else {
            this.status = NodeStatus.FAILURE;
        }
    }

    public reset(): void {
        super.reset();
        this.isRunning = false;
    }
}

// 条件等待节点：条件满足前一直保持运行状态。
export class ConditionWaitNode extends BehaviorNode {
    constructor(private conditionFn: (inst: Entity) => boolean, name: string = "ConditionWait") {
        super(name);
    }

    public visit(inst: Entity): void {
        if (this.conditionFn(inst)) {
            this.status = NodeStatus.SUCCESS;
        } else {
            this.status = NodeStatus.RUNNING;
        }
    }
}

// 闭锁节点：在一段时间窗口内允许子节点执行，超出窗口则失败。
export class LatchNode extends BehaviorNode {
    private currentLatchDuration: number = 0;
    private lastLatchTime: number = -Infinity;

    constructor(private latchDurationFn: (inst: Entity) => number, child: BehaviorNode) {
        super(`Latch`, [child]);
    }

    public visit(inst: Entity): void {
        const currentTime = BrainManager.GLOBAL_TIME;

        if (this.status === NodeStatus.READY) {
            if (currentTime > this.currentLatchDuration + this.lastLatchTime) {
                this.lastLatchTime = currentTime;
                this.currentLatchDuration = this.latchDurationFn(inst);
                this.status = NodeStatus.RUNNING;
            } else {
                this.status = NodeStatus.FAILURE;
            }
        }

        if (this.status === NodeStatus.RUNNING) {
            const child = this.children![0];
            child.visit(inst);
            this.status = child.status;
        }
    }
}

// 事件节点：监听实体事件，事件触发后驱动子节点执行。
export class EventNode extends BehaviorNode {
    private triggered: boolean = false;
    private eventData: any = null;
    private boundOnEvent: (data: any) => void;

    constructor(public inst: Entity, public event: string, child: BehaviorNode, public priority: number = 0) {
        super(`Event(${event})`, [child]);
        
        this.boundOnEvent = this.onEvent.bind(this);
        this.inst.listenForEvent(this.event, this.boundOnEvent);
    }

    protected onStop(): void {
        if (this.boundOnEvent) {
            this.inst.removeEventCallback(this.event, this.boundOnEvent);
        }
    }

    private onEvent(data: any): void {
        if (this.status === NodeStatus.RUNNING) {
            this.children![0].reset();
        }
        this.triggered = true;
        this.eventData = data;

        // Force Wake parent PriorityNodes
        this.doToParents((node) => {
            if (node instanceof PriorityNode) {
                node.lastTime = null;
            }
        });
    }

    public step(inst: Entity): void {
        super.step(inst);
        this.triggered = false;
    }

    public reset(): void {
        this.triggered = false;
        super.reset();
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY && this.triggered) {
            this.status = NodeStatus.RUNNING;
        }

        if (this.status === NodeStatus.RUNNING) {
            const child = this.children![0];
            child.visit(inst);
            this.status = child.status;
        } else {
            this.status = NodeStatus.FAILURE;
        }
    }
}
