import { StateGraph } from "./StateGraph";

// 状态机调度器：统一管理一个 World 内所有 StateGraph 的唤醒、休眠和时间推进。
export class SGManager {
    public static GLOBAL_TIME: number = 0;

    private updaters: Set<StateGraph> = new Set();
    private hibernaters: Set<StateGraph> = new Set();
    private tickwaiters: Map<number, Set<StateGraph>> = new Map();

    private currentTick: number = 0;
    private tickTime: number = 0.033;
    public currentTime: number = 0;

    public addInstance(sg: StateGraph): void {
        this.updaters.add(sg);
    }

    public removeInstance(sg: StateGraph): void {
        this.updaters.delete(sg);
        this.hibernaters.delete(sg);
        for (const [tick, waiters] of this.tickwaiters.entries()) {
            waiters.delete(sg);
            if (waiters.size === 0) {
                this.tickwaiters.delete(tick);
            }
        }
    }

    public wake(sg: StateGraph): void {
        if (this.hibernaters.has(sg) || this.isWaiting(sg)) {
            this.removeInstance(sg);
            this.updaters.add(sg);
        }
    }

    public hibernate(sg: StateGraph): void {
        this.removeInstance(sg);
        this.hibernaters.add(sg);
    }

    public sleep(sg: StateGraph, timeToWait: number): void {
        let sleepTicks = Math.floor(timeToWait / this.tickTime);
        if (sleepTicks === 0) {
            sleepTicks = 1;
        }

        const targetTick = this.currentTick + sleepTicks + 1;
        this.removeInstance(sg);

        if (!this.tickwaiters.has(targetTick)) {
            this.tickwaiters.set(targetTick, new Set());
        }
        this.tickwaiters.get(targetTick)!.add(sg);
    }

    public update(dt: number): void {
        this.currentTime += dt;
        SGManager.GLOBAL_TIME = this.currentTime;
        this.currentTick++;

        const waiters = this.tickwaiters.get(this.currentTick);
        if (waiters) {
            for (const sg of waiters) {
                this.updaters.add(sg);
            }
            this.tickwaiters.delete(this.currentTick);
        }

        const safeUpdaters = Array.from(this.updaters);
        this.updaters.clear();

        for (const sg of safeUpdaters) {
            if (!sg.inst || !sg.inst.isValid) {
                this.removeInstance(sg);
                continue;
            }

            const sleepAmount = sg.updateState(dt);
            if (sleepAmount !== null) {
                if (sleepAmount > 0) {
                    this.sleep(sg, sleepAmount);
                } else {
                    this.updaters.add(sg);
                }
            } else {
                this.hibernate(sg);
            }
        }
    }

    public onEnterNewState(sg: StateGraph): void {
        this.wake(sg);
    }

    private isWaiting(sg: StateGraph): boolean {
        for (const waiters of this.tickwaiters.values()) {
            if (waiters.has(sg)) {
                return true;
            }
        }
        return false;
    }
}
