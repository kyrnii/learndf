import { Entity } from "../core/Entity";
import { BrainManager } from "../core/behavior/BrainManager";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { Transform } from "../components/Transform";
import { resolveValue, ValueOrFn } from "./utils";

export interface WanderTimes {
    minWalkTime?: number;
    randWalkTime?: number;
    minWaitTime?: number;
    randWaitTime?: number;
}

export interface WanderOptions {
    wanderDist?: ValueOrFn<number>;
    shouldRun?: ValueOrFn<boolean>;
}

export class Wander extends BehaviorNode {
    private waitUntil: number = 0;
    private walking: boolean = false;

    constructor(
        private homePos?: ValueOrFn<{ x: number; z: number } | null>,
        private maxDist?: ValueOrFn<number>,
        private times?: WanderTimes,
        private options?: WanderOptions,
    ) {
        super("Wander");
    }

    private getTime(name: keyof WanderTimes, fallback: number): number {
        return this.times?.[name] ?? fallback;
    }

    private setWait(seconds: number): void {
        this.waitUntil = BrainManager.GLOBAL_TIME + seconds;
        this.sleep(seconds);
    }

    private randomDuration(min: number, random: number): number {
        return min + (Math.random() * random);
    }

    private isFarFromHome(inst: Entity, transform: Transform): boolean {
        if (!this.homePos || !this.maxDist) {
            return false;
        }

        const home = resolveValue(this.homePos, inst);
        if (!home) {
            return false;
        }

        const maxDist = resolveValue(this.maxDist, inst);
        return transform.getDistanceSqToPoint(home.x, home.z) > maxDist * maxDist;
    }

    private pickDestination(inst: Entity, transform: Transform): { x: number; z: number } | null {
        if (this.homePos && this.maxDist && this.isFarFromHome(inst, transform)) {
            return resolveValue(this.homePos, inst);
        }

        const radius = this.options?.wanderDist
            ? resolveValue(this.options.wanderDist, inst)
            : 12;
        const angle = Math.random() * Math.PI * 2;

        return {
            x: transform.x + Math.cos(angle) * radius,
            z: transform.z + Math.sin(angle) * radius,
        };
    }

    private holdPosition(locomotor: Locomotor): void {
        locomotor.stop();
        this.walking = false;
        this.setWait(this.randomDuration(
            this.getTime("minWaitTime", 1),
            this.getTime("randWaitTime", 3),
        ));
        this.status = NodeStatus.RUNNING;
    }

    public visit(inst: Entity): void {
        const transform = inst.getComponent(Transform);
        const locomotor = inst.getComponent(Locomotor);
        if (!transform || !locomotor) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.status === NodeStatus.READY) {
            this.walking = false;
            this.holdPosition(locomotor);
            return;
        }

        if (!this.walking && BrainManager.GLOBAL_TIME < this.waitUntil) {
            this.status = NodeStatus.RUNNING;
            return;
        }

        if (!this.walking || !locomotor.isMoving()) {
            const destination = this.pickDestination(inst, transform);
            if (!destination) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            this.walking = true;
            locomotor.goToPoint(
                destination,
                this.options?.shouldRun ? resolveValue(this.options.shouldRun, inst) : false,
            );
            this.setWait(this.randomDuration(
                this.getTime("minWalkTime", 2),
                this.getTime("randWalkTime", 3),
            ));
        }

        if (BrainManager.GLOBAL_TIME >= this.waitUntil || !locomotor.isMoving()) {
            this.holdPosition(locomotor);
            return;
        }

        this.status = NodeStatus.RUNNING;
    }
}
