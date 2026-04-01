import { Entity } from "../Entity";
import { BrainManager } from "./BrainManager";

export enum NodeStatus {
    READY = "READY",
    SUCCESS = "SUCCESS",
    FAILURE = "FAILURE",
    RUNNING = "RUNNING",
}

// 行为树节点基类：定义状态、父子关系、睡眠机制和通用生命周期。
export abstract class BehaviorNode {
    public status: NodeStatus = NodeStatus.READY;
    public lastResult: NodeStatus = NodeStatus.READY;
    public children?: BehaviorNode[];
    public parent: BehaviorNode | null = null;
    private wakeTime: number | null = null;

    constructor(public name: string, children?: BehaviorNode[]) {
        this.children = children;
        if (this.children) {
            for (const child of this.children) {
                child.parent = this;
            }
        }
    }

    public doToParents(fn: (node: BehaviorNode) => void): void {
        if (this.parent) {
            fn(this.parent);
            this.parent.doToParents(fn);
        }
    }

    public visit(inst: Entity): void {
        this.status = NodeStatus.FAILURE;
    }

    public saveStatus(): void {
        this.lastResult = this.status;
        if (this.children) {
            for (const child of this.children) {
                child.saveStatus();
            }
        }
    }

    public step(inst: Entity): void {
        if (this.status !== NodeStatus.RUNNING) {
            this.reset();
        } else if (this.children) {
            for (const child of this.children) {
                child.step(inst);
            }
        }
    }

    public reset(): void {
        if (this.status !== NodeStatus.READY) {
            this.status = NodeStatus.READY;
            this.wakeTime = null;
            if (this.children) {
                for (const child of this.children) {
                    child.reset();
                }
            }
        }
    }

    public stop(): void {
        this.onStop();
        if (this.children) {
            for (const child of this.children) {
                child.stop();
            }
        }
    }

    protected onStop(): void {}

    public getSleepTime(): number | null {
        if (this.wakeTime === null) {
            return null;
        }
        return Math.max(0, this.wakeTime - BrainManager.GLOBAL_TIME);
    }

    public getTreeSleepTime(): number | null {
        let sleepTime: number | null = null;
        if (this.children) {
            for (const child of this.children) {
                if (child.status === NodeStatus.RUNNING) {
                    const t = child.getTreeSleepTime();
                    if (t !== null && (sleepTime === null || sleepTime > t)) {
                        sleepTime = t;
                    }
                }
            }
        }

        const myT = this.getSleepTime();
        if (myT !== null && (sleepTime === null || sleepTime > myT)) {
            sleepTime = myT;
        }

        return sleepTime;
    }

    protected sleep(seconds: number): void {
        this.wakeTime = BrainManager.GLOBAL_TIME + seconds;
    }

    protected clearSleep(): void {
        this.wakeTime = null;
    }
}
