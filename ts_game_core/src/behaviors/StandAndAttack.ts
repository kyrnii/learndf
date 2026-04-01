import { Entity } from "../core/Entity";
import { BrainManager } from "../core/behavior/BrainManager";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Combat } from "../components/Combat";
import { getDistanceSq, getTargetPosition, isAliveEntity } from "./utils";

// 站桩攻击节点：不主动追击，只在原地面向目标并反复尝试攻击。
export class StandAndAttack extends BehaviorNode {
    private target: Entity | null = null;
    private startTime: number | null = null;

    constructor(
        private findNewTargetFn?: (inst: Entity) => Entity | null,
        private timeout?: number,
    ) {
        super("StandAndAttack");
    }

    public visit(inst: Entity): void {
        const combat = inst.getComponent(Combat);
        if (!combat) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.status === NodeStatus.READY) {
            combat.validateTarget();
            this.target = combat.target ?? this.findNewTargetFn?.(inst) ?? null;
            combat.setTarget(this.target);

            if (!isAliveEntity(this.target)) {
                this.status = NodeStatus.FAILURE;
                return;
            }

            this.startTime = BrainManager.GLOBAL_TIME;
            this.status = NodeStatus.RUNNING;
        }

        if (!isAliveEntity(this.target)) {
            combat.clearTarget();
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.timeout !== undefined
            && this.startTime !== null
            && (BrainManager.GLOBAL_TIME - this.startTime) > this.timeout) {
            combat.clearTarget();
            this.status = NodeStatus.FAILURE;
            return;
        }

        const targetPos = getTargetPosition(this.target);
        const distSq = getDistanceSq(inst, this.target);
        if (!targetPos || distSq === null) {
            combat.clearTarget();
            this.status = NodeStatus.FAILURE;
            return;
        }

        inst.facePoint(targetPos.x, targetPos.z);

        if (distSq <= combat.attackRange * combat.attackRange) {
            combat.tryAttack(this.target);
            this.status = NodeStatus.RUNNING;
            this.sleep(0.125);
            return;
        }

        combat.clearTarget();
        this.status = NodeStatus.FAILURE;
    }
}
