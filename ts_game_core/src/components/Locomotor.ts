import { BufferedAction } from "../core/Action";
import { Component } from "../core/Component";
import { Entity } from "../core/Entity";
import { NavAgentSize } from "../world";
import { Transform } from "./Transform";

export class Locomotor extends Component {
    public static DEBUG_LOGGING = false;

    public bufferedAction: BufferedAction | null = null;

    public walkSpeed: number = 3.0;
    public runSpeed: number = 5.0;
    public navAgentSize: NavAgentSize = "small";

    public destTarget: Entity | null = null;
    public destPos: { x: number; z: number } | null = null;
    private movingDirectly: boolean = false;
    private directRun: boolean = false;
    private arriveDistance: number = 0.1;

    private pathSteps: Array<{ x: number; z: number }> = [];
    private currentPathStepIndex: number = 0;
    private pathGoal: { x: number; z: number } | null = null;

    private pathRecalcCooldown: number = 0;
    private readonly pathRecalcInterval: number = 0.2;
    private pathRequestId: number | null = null;
    private pathRequestDestination: { x: number; z: number } | null = null;
    private blockedMoveTime: number = 0;
    private readonly blockedRepathThreshold: number = 0.35;

    public onAdd(): void {
        this.inst.startUpdatingComponent(this);

        this.inst.listenForEvent("action_frame", () => {
            this.performBufferedAction();
        });
    }

    public update(dt: number): void {
        if (this.pathRecalcCooldown > 0) {
            this.pathRecalcCooldown = Math.max(0, this.pathRecalcCooldown - dt);
        }

        const transform = this.inst.getComponent(Transform);
        if (!transform) {
            return;
        }

        if (this.bufferedAction) {
            const targetPos = this.getBufferedActionTargetPosition();
            if (targetPos) {
                const requiredDist = this.bufferedAction.action.distance;
                const distSq = transform.getDistanceSqToPoint(targetPos.x, targetPos.z);

                if (distSq <= requiredDist * requiredDist) {
                    this.onBufferedActionArrived();
                    return;
                }

                if (!this.moveToward(transform, targetPos.x, targetPos.z, this.walkSpeed, dt)) {
                    this.stop();
                    return;
                }

                this.debugLog(`Walking... pos: (${transform.x.toFixed(1)}, ${transform.z.toFixed(1)})`);
            }
        } else if (this.movingDirectly && this.destPos) {
            const dx = this.destPos.x - transform.x;
            const dz = this.destPos.z - transform.z;
            const distSq = dx * dx + dz * dz;

            if (distSq <= this.arriveDistance * this.arriveDistance) {
                this.stop();
                return;
            }

            const speed = this.directRun ? this.runSpeed : this.walkSpeed;
            if (!this.moveToward(transform, this.destPos.x, this.destPos.z, speed, dt)) {
                this.stop();
                return;
            }

            this.debugLog(`Moving... pos: (${transform.x.toFixed(1)}, ${transform.z.toFixed(1)})`);
        }
    }

    private getBufferedActionTargetPosition(): { x: number; z: number } | null {
        const act = this.bufferedAction;
        if (!act) {
            return null;
        }

        if (act.target) {
            const targetTransform = act.target.getComponent(Transform);
            if (targetTransform) {
                return {
                    x: targetTransform.x,
                    z: targetTransform.z,
                };
            }
        } else if (act.pos) {
            return {
                x: act.pos.x,
                z: act.pos.z,
            };
        }

        return null;
    }

    private onBufferedActionArrived(): void {
        this.stopMovementOnly();
        this.destTarget = null;
        this.destPos = null;

        const act = this.bufferedAction;
        if (!act) {
            return;
        }

        const sgc = this.inst.sg;
        if (sgc && act.action.sgState) {
            if (sgc.currentState?.name !== act.action.sgState) {
                sgc.goToState(act.action.sgState, act);
            }
        } else {
            this.performBufferedAction();
        }
    }

    private moveToward(transform: Transform, targetX: number, targetZ: number, speed: number, dt: number): boolean {
        const steeringTarget = this.resolveSteeringTarget(transform, targetX, targetZ);
        if (!steeringTarget) {
            this.blockedMoveTime = 0;
            this.stopMovementOnly();
            return false;
        }

        const dx = steeringTarget.x - transform.x;
        const dz = steeringTarget.z - transform.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= 0) {
            this.blockedMoveTime = 0;
            this.stopMovementOnly();
            return true;
        }

        const len = Math.sqrt(distSq);
        const moveDist = speed * dt;
        const tryMove = this.computeMoveTarget(
            transform.x,
            transform.z,
            dx,
            dz,
            len,
            moveDist,
            steeringTarget.x,
            steeringTarget.z,
        );
        if (!tryMove) {
            this.blockedMoveTime += dt;
            this.stopMotorOnly();
            if (this.blockedMoveTime >= this.blockedRepathThreshold) {
                this.debugLog("Current path step is stuck; invalidating current path for repath.");
                this.clearPath(false);
                this.clearPathRequest();
                this.pathRecalcCooldown = 0;
                this.blockedMoveTime = 0;
            }
            return true;
        }

        this.blockedMoveTime = 0;

        const physics = this.inst.physics;
        const worldPhysics = this.inst.map?.physics ?? this.inst.world?.physics;

        if (physics && worldPhysics) {
            this.inst.facePoint(steeringTarget.x, steeringTarget.z);
            const safeDx = tryMove.x - transform.x;
            const safeDz = tryMove.z - transform.z;
            const safeLen = Math.sqrt((safeDx * safeDx) + (safeDz * safeDz));
            if (safeLen <= 0) {
                this.stopMovementOnly();
                return true;
            }
            const velocityScale = 1 / Math.max(dt, 1e-6);
            worldPhysics.setMotorVel(physics, safeDx * velocityScale, 0, safeDz * velocityScale);
            return true;
        }

        transform.setPosition(tryMove.x, transform.y, tryMove.z);
        if (len <= moveDist) {
            this.stopMovementOnly();
        }
        return true;
    }

    private resolveSteeringTarget(
        transform: Transform,
        targetX: number,
        targetZ: number,
    ): { x: number; z: number } | null {
        const world = this.inst.world;
        const current = { x: transform.x, z: transform.z };
        const destination = { x: targetX, z: targetZ };

        if (!world) {
            this.clearPathRequest();
            this.clearPath(true);
            return destination;
        }

        this.consumePathRequestResult();
        this.advancePathSteps(transform, current, world);

        const sameGoalAsCurrentPath =
            this.pathGoal !== null &&
            this.isSamePathDestination(destination, this.pathGoal, world);
        const currentStep = this.getCurrentPathStep();

        if (currentStep && sameGoalAsCurrentPath) {
            return currentStep;
        }

        if (!this.hasActivePath() && world.isPathClear(current, destination, this.inst.map, this.navAgentSize)) {
            this.clearPathRequest();
            this.clearPath();
            return destination;
        }

        if (this.hasActivePath()) {
            return this.getCurrentPathStep();
        }

        if (this.pathRecalcCooldown <= 0) {
            this.pathRecalcCooldown = this.pathRecalcInterval;
            this.requestPathIfNeeded(current, destination);
        }

        return this.getCurrentPathStep();
    }

    private advancePathSteps(
        transform: Transform,
        current: { x: number; z: number },
        world: NonNullable<Entity["world"]>,
    ): void {
        const map = this.inst.map ?? world.map;
        const waypointReachDist = Math.max(0.05, map.cellSize * 0.15);

        while (this.hasActivePath()) {
            const waypoint = this.getCurrentPathStep();
            if (!waypoint) {
                break;
            }

            const waypointDistSq = transform.getDistanceSqToPoint(waypoint.x, waypoint.z);
            if (waypointDistSq <= waypointReachDist * waypointReachDist) {
                this.debugLog(
                    `Advance path step ${this.currentPathStepIndex + 1}/${this.pathSteps.length} at (${waypoint.x.toFixed(1)}, ${waypoint.z.toFixed(1)})`,
                );
                this.currentPathStepIndex++;
                continue;
            }

            break;
        }

        if (!this.hasActivePath()) {
            this.clearPath();
        }
    }

    private computeMoveTarget(
        currentX: number,
        currentZ: number,
        dx: number,
        dz: number,
        len: number,
        moveDist: number,
        targetX: number,
        targetZ: number,
    ): { x: number; z: number } | null {
        const world = this.inst.world;
        if (!world) {
            return len <= moveDist
                ? { x: targetX, z: targetZ }
                : {
                    x: currentX + (dx / len) * moveDist,
                    z: currentZ + (dz / len) * moveDist,
                };
        }

        const minStep = Math.max((this.inst.map ?? world.map).cellSize * 0.1, 0.05);
        let attemptDist = moveDist;

        while (attemptDist >= minStep) {
            const next = len <= attemptDist
                ? { x: targetX, z: targetZ }
                : {
                    x: currentX + (dx / len) * attemptDist,
                    z: currentZ + (dz / len) * attemptDist,
                };

            if (
                !world.isBlocked(next.x, next.z, this.inst.map, this.navAgentSize) &&
                world.isPathClear({ x: currentX, z: currentZ }, next, this.inst.map, this.navAgentSize)
            ) {
                return next;
            }

            attemptDist *= 0.5;
        }

        return null;
    }

    private stopMovementOnly(): void {
        this.clearPathRequest();
        this.clearPath(true);
        this.pathRecalcCooldown = 0;
        this.blockedMoveTime = 0;
        this.stopMotorOnly();
    }

    private stopMotorOnly(): void {
        const worldPhysics = this.inst.map?.physics ?? this.inst.world?.physics;
        if (this.inst.physics && worldPhysics) {
            worldPhysics.stop(this.inst.physics);
        }
    }

    public isDoingAction(actionId: string, target: Entity | null): boolean {
        if (!this.bufferedAction) {
            return false;
        }

        return this.bufferedAction.action.id === actionId && this.bufferedAction.target === target;
    }

    public pushAction(action: BufferedAction): void {
        this.bufferedAction = action;
        this.movingDirectly = false;

        const transform = this.inst.getComponent(Transform);
        const sgc = this.inst.sg;
        if (!transform) {
            return;
        }

        let targetX: number | null = null;
        let targetZ: number | null = null;

        if (action.target) {
            this.destTarget = action.target;
            const targetTransform = action.target.getComponent(Transform);
            if (targetTransform) {
                targetX = targetTransform.x;
                targetZ = targetTransform.z;
            }
        } else if (action.pos) {
            this.destPos = action.pos;
            targetX = action.pos.x;
            targetZ = action.pos.z;
        }

        if (targetX !== null && targetZ !== null) {
            const distSq = transform.getDistanceSqToPoint(targetX, targetZ);
            const requiredDist = action.action.distance;

            if (distSq <= requiredDist * requiredDist) {
                if (sgc && action.action.sgState) {
                    sgc.goToState(action.action.sgState, action);
                } else {
                    this.performBufferedAction();
                }
            } else if (sgc) {
                sgc.goToState("walk");
            }
        }
    }

    public goToPoint(pos: { x: number; z: number }, run: boolean = false, arriveDistance: number = 0.1): void {
        this.bufferedAction = null;
        this.destTarget = null;
        this.destPos = { ...pos };
        this.movingDirectly = true;
        this.directRun = run;
        this.arriveDistance = arriveDistance;
        this.inst.sg?.goToState("walk");
    }

    public stop(): void {
        this.stopMovementOnly();
        this.destTarget = null;
        this.destPos = null;
        this.movingDirectly = false;
        this.directRun = false;

        if (this.inst.sg?.currentState?.name === "walk") {
            this.inst.sg.goToState("idle");
        }
    }

    public wantsToMoveForward(): boolean {
        return this.bufferedAction !== null || this.movingDirectly;
    }

    public isMoving(): boolean {
        return this.wantsToMoveForward();
    }

    public getDebugPath(transform?: Transform | null): Array<{ x: number; z: number }> {
        const result = this.pathSteps
            .slice(this.currentPathStepIndex)
            .map((waypoint) => ({ ...waypoint }));

        if (this.pathRequestDestination && result.length > 0) {
            const last = result[result.length - 1];
            if (!last || last.x !== this.pathRequestDestination.x || last.z !== this.pathRequestDestination.z) {
                result.push({ ...this.pathRequestDestination });
            }
        }

        const targetPos = this.bufferedAction ? this.getBufferedActionTargetPosition() : this.destPos;
        if (targetPos) {
            const last = result[result.length - 1];
            if (!last || last.x !== targetPos.x || last.z !== targetPos.z) {
                result.push({ ...targetPos });
            }
        }

        if (result.length === 0 && transform && targetPos) {
            result.push({ x: targetPos.x, z: targetPos.z });
        }

        return result;
    }

    public performBufferedAction(): boolean {
        if (!this.bufferedAction) {
            return false;
        }

        const act = this.bufferedAction;
        this.bufferedAction = null;
        this.destTarget = null;
        this.destPos = null;
        this.stopMovementOnly();

        const result = act.action.fn(act);
        if (result) {
            act.succeed();
        } else {
            act.fail();
        }
        return result;
    }

    private requestPathIfNeeded(
        current: { x: number; z: number },
        destination: { x: number; z: number },
    ): void {
        const world = this.inst.world;
        if (!world) {
            return;
        }

        if (this.pathRequestId !== null && this.pathRequestDestination) {
            const dx = this.pathRequestDestination.x - destination.x;
            const dz = this.pathRequestDestination.z - destination.z;
            const map = this.inst.map ?? world.map;
            const sameDestination = (dx * dx) + (dz * dz) <= (map.cellSize * map.cellSize * 0.25);
            if (sameDestination) {
                return;
            }

            world.pathfinder.cancel(this.pathRequestId);
            this.pathRequestId = null;
            this.pathRequestDestination = null;
        }

        if (!this.hasActivePath()) {
            const bootstrapPath = world.findPathImmediate(
                current,
                destination,
                { agentSize: this.navAgentSize },
                this.inst.map,
            );
            if (bootstrapPath && bootstrapPath.length > 0) {
                this.setPath(this.normalizeIncomingPath(current, bootstrapPath, world), destination);
                this.clearPathRequest();
                return;
            }
        }

        this.pathRequestId = world.pathfinder.submit({
            from: current,
            to: destination,
            map: this.inst.map,
            options: {
                agentSize: this.navAgentSize,
            },
        });
        this.pathRequestDestination = { ...destination };
    }

    private consumePathRequestResult(): void {
        if (this.pathRequestId === null || !this.inst.world) {
            return;
        }

        const snapshot = this.inst.world.pathfinder.get(this.pathRequestId);
        if (!snapshot) {
            this.clearPathRequest();
            return;
        }

        if (snapshot.status === "pending") {
            return;
        }

        if (snapshot.status === "ready" && snapshot.path && snapshot.path.length > 0) {
            const keepCurrentPath =
                this.hasActivePath() &&
                this.pathGoal !== null &&
                this.isSamePathDestination(snapshot.input.to, this.pathGoal, this.inst.world);

            if (!keepCurrentPath) {
                const transform = this.inst.getComponent(Transform);
                const current = transform
                    ? { x: transform.x, z: transform.z }
                    : { ...snapshot.input.from };
                this.setPath(this.normalizeIncomingPath(current, snapshot.path, this.inst.world), snapshot.input.to);
            }
        }

        if (snapshot.status === "failed" && !this.hasActivePath()) {
            const detour = this.inst.world.findDetourPoint(
                snapshot.input.from,
                snapshot.input.to,
                undefined,
                this.inst.map,
                this.navAgentSize,
            );
            this.setPath(detour ? [detour] : [], snapshot.input.to);
        }

        this.clearPathRequest();
    }

    private normalizeIncomingPath(
        current: { x: number; z: number },
        path: Array<{ x: number; z: number }>,
        world: NonNullable<Entity["world"]>,
    ): Array<{ x: number; z: number }> {
        const normalized = path.map((point) => ({ ...point }));
        const map = this.inst.map ?? world.map;
        const reachDistSq = Math.max(this.arriveDistance, map.cellSize * 0.75) ** 2;
        const goal = normalized[normalized.length - 1] ?? null;

        while (normalized.length > 1) {
            const first = normalized[0];
            const dx = first.x - current.x;
            const dz = first.z - current.z;
            const firstDistSq = (dx * dx) + (dz * dz);

            if (firstDistSq <= reachDistSq) {
                normalized.shift();
                continue;
            }

            const second = normalized[1];
            const secondDx = second.x - current.x;
            const secondDz = second.z - current.z;
            const secondDistSq = (secondDx * secondDx) + (secondDz * secondDz);
            const canSeeSecond = world.isPathClear(current, second, this.inst.map, this.navAgentSize);
            if (canSeeSecond && secondDistSq <= firstDistSq + (map.cellSize * map.cellSize * 0.25)) {
                normalized.shift();
                continue;
            }

            if (goal && canSeeSecond) {
                const currentGoalDx = goal.x - current.x;
                const currentGoalDz = goal.z - current.z;
                const firstGoalDx = goal.x - first.x;
                const firstGoalDz = goal.z - first.z;
                const currentGoalDistSq = (currentGoalDx * currentGoalDx) + (currentGoalDz * currentGoalDz);
                const firstGoalDistSq = (firstGoalDx * firstGoalDx) + (firstGoalDz * firstGoalDz);
                if (firstGoalDistSq > currentGoalDistSq) {
                    normalized.shift();
                    continue;
                }
            }

            break;
        }

        return normalized;
    }

    private setPath(path: Array<{ x: number; z: number }>, goal: { x: number; z: number }): void {
        this.pathSteps = path;
        this.currentPathStepIndex = 0;
        this.pathGoal = path.length > 0 ? { ...goal } : null;
        const pathSummary = path.map((point, index) => `${index + 1}:(${point.x.toFixed(1)},${point.z.toFixed(1)})`).join(" -> ");
        this.debugLog(
            `Set path to (${goal.x.toFixed(1)}, ${goal.z.toFixed(1)}) with ${path.length} step(s): ${pathSummary || "<empty>"}`,
        );
    }

    private clearPath(clearGoal: boolean = false): void {
        this.pathSteps = [];
        this.currentPathStepIndex = 0;
        if (clearGoal) {
            this.pathGoal = null;
        }
    }

    private hasActivePath(): boolean {
        return this.currentPathStepIndex < this.pathSteps.length;
    }

    private getCurrentPathStep(): { x: number; z: number } | null {
        return this.pathSteps[this.currentPathStepIndex] ?? null;
    }

    private getNextPathStep(): { x: number; z: number } | null {
        return this.pathSteps[this.currentPathStepIndex + 1] ?? null;
    }

    private clearPathRequest(): void {
        if (this.pathRequestId !== null && this.inst.world) {
            this.inst.world.pathfinder.cancel(this.pathRequestId);
        }
        this.pathRequestId = null;
        this.pathRequestDestination = null;
    }

    private isSamePathDestination(
        left: { x: number; z: number },
        right: { x: number; z: number },
        world: NonNullable<Entity["world"]>,
    ): boolean {
        const map = this.inst.map ?? world.map;
        const dx = left.x - right.x;
        const dz = left.z - right.z;
        return (dx * dx) + (dz * dz) <= (map.cellSize * map.cellSize * 0.25);
    }

    private debugLog(message: string): void {
        if (!Locomotor.DEBUG_LOGGING) {
            return;
        }

        console.log(`[Locomotor: ${this.inst.prefabName}] ${message}`);
    }
}
