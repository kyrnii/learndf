import { Component } from '../core/Component';
import { Entity } from '../core/Entity';
import { Health } from './Health';

export class Combat extends Component {
    public baseDamage: number = 10;
    public attackRange: number = 2;
    public attackPeriod: number = 1; // 1 attack per second

    private timeSinceLastAttack: number = 0;

    public onAdd(): void {
        // Need to update every frame if we want to track cooldowns
        this.inst.startUpdatingComponent(this);
    }

    public update(dt: number): void {
        this.timeSinceLastAttack += dt;
    }

    public canAttack(target: Entity): boolean {
        return this.timeSinceLastAttack >= this.attackPeriod;
    }

    public doAttack(target: Entity): void {
        if (!this.canAttack(target)) {
            console.log(`[${this.inst.prefabName}] cannot attack yet, on cooldown.`);
            return;
        }

        this.timeSinceLastAttack = 0;
        
        const targetHealth = target.getComponent(Health);
        if (targetHealth) {
            console.log(`[${this.inst.prefabName}] attacks [${target.prefabName}] for ${this.baseDamage} damage!`);
            targetHealth.takeDamage(this.baseDamage);
        } else {
            console.log(`[${this.inst.prefabName}] attacks [${target.prefabName}] but it has no health!`);
        }
    }
}
