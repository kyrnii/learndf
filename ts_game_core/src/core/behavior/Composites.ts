import { Entity } from "../Entity";
import { BehaviorNode, NodeStatus } from "./Node";
import { BrainManager } from "./BrainManager";

// 选择节点：按顺序尝试子节点，直到有一个成功或正在运行。
export class Selector extends BehaviorNode {
    private idx: number = 0;

    constructor(children: BehaviorNode[]) {
        super("Selector", children);
    }

    public reset(): void {
        super.reset();
        this.idx = 0;
    }

    public visit(inst: Entity): void {
        if (this.status !== NodeStatus.RUNNING) {
            this.idx = 0;
        }

        while (this.idx < this.children!.length) {
            const child = this.children![this.idx];
            child.visit(inst);
            const status = child.status;

            if (status === NodeStatus.RUNNING || status === NodeStatus.SUCCESS) {
                this.status = status;
                return;
            }
            this.idx++;
        }
        this.status = NodeStatus.FAILURE;
    }
}

// 顺序节点：按顺序执行子节点，直到有一个失败或正在运行。
export class Sequence extends BehaviorNode {
    private idx: number = 0;

    constructor(children: BehaviorNode[]) {
        super("Sequence", children);
    }

    public reset(): void {
        super.reset();
        this.idx = 0;
    }

    public visit(inst: Entity): void {
        if (this.status !== NodeStatus.RUNNING) {
            this.idx = 0;
        }

        while (this.idx < this.children!.length) {
            const child = this.children![this.idx];
            child.visit(inst);
            const status = child.status;

            if (status === NodeStatus.RUNNING || status === NodeStatus.FAILURE) {
                this.status = status;
                return;
            }
            this.idx++;
        }
        this.status = NodeStatus.SUCCESS;
    }
}

// 优先级节点：定期重新评估子节点，并在更高优先级出现时打断当前子节点。
export class PriorityNode extends BehaviorNode {
    private idx: number | null = null;
    public lastTime: number | null = null;
    private period: number;

    constructor(children: BehaviorNode[], period: number = 1.0) {
        super("Priority", children);
        this.period = period;
        // Jitter starting time so multiple brains don't tick on exact same frame
        this.lastTime = (this.period * 0.5) + (this.period * Math.random());
    }

    public getSleepTime(): number | null {
        if (this.status === NodeStatus.RUNNING) {
            if (!this.period) return 0;
            let timeTo = 0;
            if (this.lastTime !== null) {
                timeTo = this.lastTime + this.period - BrainManager.GLOBAL_TIME;
                if (timeTo < 0) timeTo = 0;
            }
            return timeTo;
        } else if (this.status === NodeStatus.READY) {
            return 0;
        }
        return null;
    }

    public reset(): void {
        super.reset();
        this.idx = null;
    }

    public visit(inst: Entity): void {
        const time = BrainManager.GLOBAL_TIME;
        const doEval = this.lastTime === null || !this.period || (this.lastTime + this.period < time);

        if (doEval) {
            this.lastTime = time;
            let found = false;
            for (let i = 0; i < this.children!.length; i++) {
                const child = this.children![i];

                if (child.status === NodeStatus.FAILURE || child.status === NodeStatus.SUCCESS) {
                    child.reset();
                }
                child.visit(inst);
                
                const cs = child.status;
                if (cs === NodeStatus.SUCCESS || cs === NodeStatus.RUNNING) {
                    if (this.idx !== null && this.idx !== i) {
                        this.children![this.idx].reset(); // Interrupt lower priority
                    }
                    this.status = cs;
                    found = true;
                    this.idx = i;
                    break;
                } else {
                    child.reset();
                }
            }
            if (!found) {
                this.status = NodeStatus.FAILURE;
            }
        } else {
            // Wait period not elapsed, just tick the RUNNING child
            if (this.idx !== null) {
                const child = this.children![this.idx];
                if (child.status === NodeStatus.RUNNING) {
                    child.visit(inst);
                    this.status = child.status;
                    if (this.status !== NodeStatus.RUNNING) {
                        this.lastTime = null; // force eval next time
                    }
                }
            }
        }
    }
}

// 随机节点：随机选择一个可执行的子节点来运行。
export class RandomNode extends BehaviorNode {
    private idx: number | null = null;

    constructor(children: BehaviorNode[]) {
        super("Random", children);
    }

    public reset(): void {
        super.reset();
        this.idx = null;
    }

    public visit(inst: Entity): void {
        if (this.status === NodeStatus.READY || this.idx === null) {
            this.idx = Math.floor(Math.random() * this.children!.length);
            const start = this.idx;

            while (true) {
                const child = this.children![this.idx];
                child.visit(inst);

                if (child.status !== NodeStatus.FAILURE) {
                    this.status = child.status;
                    return;
                }

                this.idx++;
                if (this.idx >= this.children!.length) {
                    this.idx = 0;
                }

                if (this.idx === start) {
                    this.status = NodeStatus.FAILURE;
                    return;
                }
            }
        } else {
            const child = this.children![this.idx];
            child.visit(inst);
            this.status = child.status;
        }
    }
}

// 并行节点：同时推进多个子节点，直到全部完成或其中一个失败。
export class ParallelNode extends BehaviorNode {
    protected stopOnAnyComplete: boolean = false;

    constructor(children: BehaviorNode[], name: string = "Parallel") {
        super(name, children);
    }

    public step(inst: Entity): void {
        if (this.status !== NodeStatus.RUNNING) {
            this.reset();
        } else if (this.children) {
            for (const child of this.children) {
                if (child.status === NodeStatus.SUCCESS && child.name.includes("Condition")) {
                    child.reset();
                }
                child.step(inst); // Forward step correctly in TS version
            }
        }
    }

    public visit(inst: Entity): void {
        let done = true;
        let anyDone = false;

        for (const child of this.children!) {
            if (child.name.includes("Condition")) {
                child.reset();
            }

            if (child.status !== NodeStatus.SUCCESS) {
                child.visit(inst);
                if (child.status === NodeStatus.FAILURE) {
                    this.status = NodeStatus.FAILURE;
                    return;
                }
            }

            if (child.status === NodeStatus.RUNNING) {
                done = false;
            } else {
                anyDone = true;
            }
        }

        if (done || (this.stopOnAnyComplete && anyDone)) {
            this.status = NodeStatus.SUCCESS;
        } else {
            this.status = NodeStatus.RUNNING;
        }
    }
}

// 任一完成并行节点：任意一个子节点完成即可视为整体完成。
export class ParallelNodeAny extends ParallelNode {
    constructor(children: BehaviorNode[]) {
        super(children, "Parallel(Any)");
        this.stopOnAnyComplete = true;
    }
}

// 循环节点：按顺序重复执行子节点若干轮。
export class LoopNode extends BehaviorNode {
    private idx: number = 0;
    private maxReps: number;
    private rep: number = 0;

    constructor(children: BehaviorNode[], maxReps: number) {
        super("Loop", children);
        this.maxReps = maxReps;
    }

    public reset(): void {
        super.reset();
        this.idx = 0;
        this.rep = 0;
    }

    public visit(inst: Entity): void {
        if (this.status !== NodeStatus.RUNNING) {
            this.idx = 0;
            this.rep = 0;
        }

        while (this.idx < this.children!.length) {
            const child = this.children![this.idx];
            child.visit(inst);

            if (child.status === NodeStatus.RUNNING || child.status === NodeStatus.FAILURE) {
                this.status = child.status;
                return;
            }

            this.idx++;
        }

        this.idx = 0;
        this.rep++;

        if (this.rep >= this.maxReps) {
            this.status = NodeStatus.SUCCESS;
        } else {
            for (const child of this.children!) {
                child.reset();
            }
            this.status = NodeStatus.RUNNING; // Signal loop to continue actively
        }
    }
}
