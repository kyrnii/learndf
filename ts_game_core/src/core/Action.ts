import { Entity } from "./Entity";
import { Combat } from "../components/Combat";

export class Action {
    constructor(
        public readonly id: string,
        public readonly fn: (act: BufferedAction) => boolean,
        public readonly sgState?: string, // Which StateGraph state to trigger for this action
        public readonly distance: number = 0 // Required interaction distance
    ) {}
}

export class BufferedAction {
    constructor(
        public readonly doer: Entity,
        public readonly action: Action,
        public readonly target: Entity | null = null,
        public readonly pos: {x: number, y: number, z: number} | null = null
    ) {}
}

export const ACTIONS = {
    ATTACK: new Action("ATTACK", (act: BufferedAction) => {
        if (!act.target) return false;
        
        const combat = act.doer.getComponent(Combat);
        if (combat) {
            combat.doAttack(act.target);
            return true;
        }
        return false;
    }, "attack", 2.0)
};
