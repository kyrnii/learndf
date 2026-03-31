import { Entity } from "../Entity";
import { BehaviorNode } from "./Node";
import { StateTag } from "../Tags";
import { BrainManager } from "./BrainManager";

export class Brain {
    public inst!: Entity;
    private rootNode: BehaviorNode | null = null;

    public setRoot(node: BehaviorNode): void {
        this.rootNode = node;
    }

    public start(): void {
        BrainManager.getInstance().addInstance(this);
    }

    public stop(): void {
        BrainManager.getInstance().removeInstance(this);
    }

    public onUpdate(): void {
        if (!this.rootNode) return;

        // Check if entity is busy in stategraph (like hitting, sleeping, dead)
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
        return 0; // Or null, we'll return 0 if no tree
    }
}
