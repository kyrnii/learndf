import { Brain } from "./Brain";

export class BrainManager {
    public static GLOBAL_TIME: number = 0;
    private static instance: BrainManager;

    private updaters: Set<Brain> = new Set();
    private hibernaters: Set<Brain> = new Set();
    private tickwaiters: Map<number, Set<Brain>> = new Map();

    private currentTick: number = 0;
    private tickTime: number = 0.033; // 30Hz

    public static getInstance(): BrainManager {
        if (!BrainManager.instance) {
            BrainManager.instance = new BrainManager();
        }
        return BrainManager.instance;
    }

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
        if (sleepTicks === 0) sleepTicks = 1;

        const targetTick = this.currentTick + sleepTicks;

        this.removeInstance(brain);

        if (!this.tickwaiters.has(targetTick)) {
            this.tickwaiters.set(targetTick, new Set());
        }
        this.tickwaiters.get(targetTick)!.add(brain);
    }

    private isWaiting(brain: Brain): boolean {
        for (const waiters of this.tickwaiters.values()) {
            if (waiters.has(brain)) return true;
        }
        return false;
    }

    public update(dt: number): void {
        BrainManager.GLOBAL_TIME += dt;
        this.currentTick++; // Simulate advancing ticks

        const waiters = this.tickwaiters.get(this.currentTick);
        if (waiters) {
            for (const brain of waiters) {
                this.updaters.add(brain);
            }
            this.tickwaiters.delete(this.currentTick);
        }

        // Iterate safely over the updaters
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
                // Else: Do nothing, leave it in updaters set to tick again next frame
            } else {
                this.hibernate(brain);
            }
        }
    }
}
