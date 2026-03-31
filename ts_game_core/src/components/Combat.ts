import { Component } from '../core/Component';
import { Entity } from '../core/Entity';
import { BufferedAction, ACTIONS } from '../core/Action';
import { Health } from './Health';
import { Locomotor } from './Locomotor';

export class Combat extends Component {
    public baseDamage: number = 10;
    public attackRange: number = 2;
    public attackPeriod: number = 1; // 1 attack per second
    public target: Entity | null = null;

    private timeSinceLastAttack: number = 0;

    public onAdd(): void {
        // Need to update every frame if we want to track cooldowns
        this.inst.startUpdatingComponent(this);
    }

    public update(dt: number): void {
        this.timeSinceLastAttack += dt;
    }

    public canAttack(target: Entity): boolean {
        return this.timeSinceLastAttack >= this.attackPeriod && target.isValid;
    }

    public doAttack(target: Entity): void {
        if (!this.canAttack(target)) {
            console.log(`[${this.inst.prefabName}] cannot attack yet, on cooldown.`);
            this.inst.pushEvent("onmissother", { target });
            return;
        }

        this.timeSinceLastAttack = 0;
        this.target = target;
        
        const targetHealth = target.getComponent(Health);
        if (targetHealth) {
            console.log(`[${this.inst.prefabName}] attacks [${target.prefabName}] for ${this.baseDamage} damage!`);
            targetHealth.takeDamage(this.baseDamage);
            this.inst.pushEvent("onattackother", { target });
        } else {
            console.log(`[${this.inst.prefabName}] attacks [${target.prefabName}] but it has no health!`);
            this.inst.pushEvent("onmissother", { target });
        }
    }

    public setTarget(target: Entity | null): void {
        this.target = target;
    }

    public clearTarget(): void {
        this.target = null;
    }

    public validateTarget(): void {
        if (this.target && !this.target.isValid) {
            this.target = null;
        }
    }

    public tryAttack(target?: Entity): boolean {
        const actualTarget = target ?? this.target;
        if (!actualTarget || !actualTarget.isValid) {
            return false;
        }

        const locomotor = this.inst.getComponent(Locomotor);
        if (!locomotor) {
            return false;
        }

        this.target = actualTarget;
        locomotor.pushAction(new BufferedAction(this.inst, ACTIONS.ATTACK, actualTarget));
        return true;
    }

    public giveUp(): void {
        this.clearTarget();
        this.inst.getComponent(Locomotor)?.stop();
    }
}
