import { Component } from '../core/Component';

export class Health extends Component {
    public maxHealth: number = 100;
    public currentHealth: number = 100;

    public setMaxHealth(amount: number): void {
        this.maxHealth = amount;
        this.currentHealth = amount;
    }

    public takeDamage(amount: number): void {
        if (this.currentHealth <= 0) return;

        this.currentHealth -= amount;
        
        // Push an event that the entity was damaged
        this.inst.pushEvent("attacked", { damage: amount });

        if (this.currentHealth <= 0) {
            this.currentHealth = 0;
            this.inst.pushEvent("death");
        }
    }

    public heal(amount: number): void {
        if (this.currentHealth <= 0) return; // Can't heal dead entities usually

        this.currentHealth += amount;
        if (this.currentHealth > this.maxHealth) {
            this.currentHealth = this.maxHealth;
        }
    }
}
