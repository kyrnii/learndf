import { Entity } from "../core/Entity";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Combat } from "../components/Combat";
import { Locomotor } from "../components/Locomotor";
import { BrainManager } from "../core/behavior/BrainManager";
import { getDistanceSq, getTargetPosition, isAliveEntity } from "./utils";

// 经典追击战斗节点：找到目标后持续追逐，进入攻击范围后反复发起攻击。
export class ChaseAndAttack extends BehaviorNode {
    private target: Entity | null = null;
    private startTime: number | null = null;
    private numAttacks: number = 0;
    private readonly onAttackFn: () => void;

    constructor(
        private instRef: Entity,
        private maxChaseTime?: number,
        private giveUpDist?: number,
        private maxAttacks?: number,
        private findNewTargetFn?: (inst: Entity) => Entity | null,
        private walk: boolean = false,
    ) {
        super("ChaseAndAttack");

        this.onAttackFn = () => {
            this.numAttacks += 1;
            this.startTime = null;
        };

        this.instRef.listenForEvent("onattackother", this.onAttackFn);
        this.instRef.listenForEvent("onmissother", this.onAttackFn);
    }

    protected onStop(): void {
        this.instRef.removeEventCallback("onattackother", this.onAttackFn);
        this.instRef.removeEventCallback("onmissother", this.onAttackFn);
    }

    public visit(inst: Entity): void {
        const combat = inst.getComponent(Combat);
        const locomotor = inst.getComponent(Locomotor);
        if (!combat || !locomotor) {
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
            this.numAttacks = 0;
            this.status = NodeStatus.RUNNING;
        }

        if (!isAliveEntity(this.target)) {
            combat.clearTarget();
            locomotor.stop();
            this.status = NodeStatus.FAILURE;
            return;
        }

        const targetPos = getTargetPosition(this.target);
        const distSq = getDistanceSq(inst, this.target);
        if (!targetPos || distSq === null) {
            combat.clearTarget();
            locomotor.stop();
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.maxAttacks !== undefined && this.numAttacks >= this.maxAttacks) {
            combat.clearTarget();
            locomotor.stop();
            this.status = NodeStatus.SUCCESS;
            return;
        }

        if ((this.giveUpDist !== undefined && distSq >= this.giveUpDist * this.giveUpDist)
            || (this.maxChaseTime !== undefined
                && this.startTime !== null
                && (BrainManager.GLOBAL_TIME - this.startTime) > this.maxChaseTime)) {
            combat.giveUp();
            this.status = NodeStatus.FAILURE;
            return;
        }

        inst.facePoint(targetPos.x, targetPos.z);

        if (distSq > combat.attackRange * combat.attackRange) {
            locomotor.goToPoint(targetPos, !this.walk, combat.attackRange);
        } else {
            locomotor.stop();
            combat.tryAttack(this.target);
        }

        this.status = NodeStatus.RUNNING;
        this.sleep(0.125);
    }
}
