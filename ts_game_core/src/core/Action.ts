import { Entity } from "./Entity";
import { Combat } from "../components/Combat";
import { Inventory } from "../components/Inventory";
import { Item } from "../components/Item";

export class Action {
    constructor(
        public readonly id: string,
        public readonly fn: (act: BufferedAction) => boolean,
        public readonly sgState?: string,
        public readonly distance: number = 0
    ) {}
}

export class BufferedAction {
    private successCallbacks: (() => void)[] = [];
    private failCallbacks: (() => void)[] = [];

    constructor(
        public readonly doer: Entity,
        public readonly action: Action,
        public readonly target: Entity | null = null,
        public readonly pos: {x: number, y: number, z: number} | null = null
    ) {}

    public addSuccessAction(fn: () => void): void {
        this.successCallbacks.push(fn);
    }

    public addFailAction(fn: () => void): void {
        this.failCallbacks.push(fn);
    }

    public succeed(): void {
        for (const fn of this.successCallbacks) fn();
    }

    public fail(): void {
        for (const fn of this.failCallbacks) fn();
    }
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
    }, "attack", 2.0),
    PICKUP: new Action("PICKUP", (act: BufferedAction) => {
        if (!act.target || !act.target.isValid) return false;

        const inventory = act.doer.getComponent(Inventory);
        const item = act.target.getComponent(Item);
        if (!inventory || !item) {
            return false;
        }

        return item.pickup(inventory);
    }, "pickup", 1.5)
};
