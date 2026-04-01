import { Brain } from "./Brain";

// 行为树调度器：统一管理一个 World 内所有 Brain 的唤醒、休眠和更新节奏。
export class BrainManager {
    public static GLOBAL_TIME: number = 0;

    private updaters: Set<Brain> = new Set();
    private hibernaters: Set<Brain> = new Set();
    private tickwaiters: Map<number, Set<Brain>> = new Map();

    private currentTick: number = 0;
    private tickTime: number = 0.033;
    public currentTime: number = 0;

    public addInstance(brain: Brain): void {
        this.updaters.add(brain);
    }

    public removeInstance(brain: Brain): void {
        this.updaters.delete(brain);
        this.hibernaters.delete(brain);
        for (const [tick, waiters] of this.tickwaiters.entries()) {
            waiters.delete(brain);
            if (waiters.size === 0) {
                this.tickwaiters.delete(tick);
            }
        }
    }

    public wake(brain: Brain): void {
        if (this.hibernaters.has(brain) || this.isWaiting(brain)) {
            this.removeInstance(brain);
            this.updaters.add(brain);
        }
    }

    public hibernate(brain: Brain): void {
        this.removeInstance(brain);
        this.hibernaters.add(brain);
    }

    public sleep(brain: Brain, timeToWait: number): void {
        let sleepTicks = Math.floor(timeToWait / this.tickTime);
        if (sleepTicks === 0) {
            sleepTicks = 1;
        }

        const targetTick = this.currentTick + sleepTicks;
        this.removeInstance(brain);

        if (!this.tickwaiters.has(targetTick)) {
            this.tickwaiters.set(targetTick, new Set());
        }
        this.tickwaiters.get(targetTick)!.add(brain);
    }

    public update(dt: number): void {
        this.currentTime += dt;
        BrainManager.GLOBAL_TIME = this.currentTime;
        this.currentTick++;

        const waiters = this.tickwaiters.get(this.currentTick);
        if (waiters) {
            for (const brain of waiters) {
                this.updaters.add(brain);
            }
            this.tickwaiters.delete(this.currentTick);
        }

        const safeUpdaters = Array.from(this.updaters);
        for (const brain of safeUpdaters) {
            if (!brain.inst || !brain.inst.isValid) {
                this.removeInstance(brain);
                continue;
            }

            brain.onUpdate();

            const sleepAmount = brain.getSleepTime();
            if (sleepAmount !== null) {
                if (sleepAmount > this.tickTime) {
                    this.sleep(brain, sleepAmount);
                }
            } else {
                this.hibernate(brain);
            }
        }
    }

    private isWaiting(brain: Brain): boolean {
        for (const waiters of this.tickwaiters.values()) {
            if (waiters.has(brain)) {
                return true;
            }
        }
        return false;
    }
}
