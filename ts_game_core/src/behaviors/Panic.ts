import { Entity } from "../core/Entity";
import { BrainManager } from "../core/behavior/BrainManager";
import { BehaviorNode, NodeStatus } from "../core/behavior/Node";
import { Locomotor } from "../components/Locomotor";
import { Transform } from "../components/Transform";
import { findWalkableOffset } from "../world";

// 惊慌乱跑节点：持续随机换方向奔跑，适合着火、恐慌等失控状态。
export class Panic extends BehaviorNode {
    private waitUntil: number = 0;

    constructor() {
        super("Panic");
    }

    private pickNewDirection(inst: Entity, locomotor: Locomotor, transform: Transform): void {
        const angle = Math.random() * Math.PI * 2;
        const destination = findWalkableOffset(inst, angle, 4, 8) ?? {
            x: transform.x + Math.cos(angle) * 4,
            z: transform.z + Math.sin(angle) * 4,
        };

        locomotor.goToPoint(destination, true);
        this.waitUntil = BrainManager.GLOBAL_TIME + 0.25 + (Math.random() * 0.25);
        this.sleep(Math.max(0, this.waitUntil - BrainManager.GLOBAL_TIME));
    }

    public visit(inst: Entity): void {
        const locomotor = inst.getComponent(Locomotor);
        const transform = inst.getComponent(Transform);
        if (!locomotor || !transform) {
            this.status = NodeStatus.FAILURE;
            return;
        }

        if (this.status === NodeStatus.READY) {
            this.pickNewDirection(inst, locomotor, transform);
            this.status = NodeStatus.RUNNING;
            return;
        }

        if (BrainManager.GLOBAL_TIME >= this.waitUntil) {
            this.pickNewDirection(inst, locomotor, transform);
        } else {
            this.sleep(Math.max(0, this.waitUntil - BrainManager.GLOBAL_TIME));
        }

        this.status = NodeStatus.RUNNING;
    }
}
