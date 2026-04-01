import { Entity } from "../Entity";
import { BehaviorNode } from "./Node";
import { StateTag } from "../Tags";

// 行为树容器：挂在实体身上，负责驱动整棵行为树按节奏思考。
export class Brain {
    public inst!: Entity;
    private rootNode: BehaviorNode | null = null;

    public setRoot(node: BehaviorNode): void {
        this.rootNode = node;
    }

    public start(): void {
        this.inst.world?.brainManager.addInstance(this);
    }

    public stop(): void {
        this.inst.world?.brainManager.removeInstance(this);
    }

    public onUpdate(): void {
        if (!this.rootNode) {
            return;
        }

        const sg = this.inst.sg;
        if (!sg || !sg.hasStateTag(StateTag.Busy)) {
            this.rootNode.visit(this.inst);
            this.rootNode.saveStatus();
            this.rootNode.step(this.inst);
        }
    }

    public getSleepTime(): number | null {
        if (this.rootNode) {
            return this.rootNode.getTreeSleepTime();
        }
        return 0;
    }
}
