import { Entity } from './core/Entity';
import { Health } from './components/Health';
import { Combat } from './components/Combat';
import { Inventory } from './components/Inventory';
import { Item } from './components/Item';
import { StateGraph } from './core/stategraph/StateGraph';
import { SGPlayer } from './stategraphs/SGPlayer';
import { SGSpider } from './stategraphs/SGSpider';
import { EntityTag } from './core/Tags';
import { Locomotor } from './components/Locomotor';
import { BufferedAction, ACTIONS } from './core/Action';
import { Transform } from './components/Transform';
import { Brain } from './core/behavior/Brain';
import { PriorityNode } from './core/behavior/Composites';
import { BrainManager } from './core/behavior/BrainManager';
import { SGManager } from './core/stategraph/SGManager';
import { ChaseAndAttack } from './behaviors';

// ============================================
// 1. Setup Entities
// ============================================

function createPlayer(): Entity {
    const inst = new Entity();
    inst.prefabName = "Player";
    inst.addTag(EntityTag.Player | EntityTag.Character);

    const health = inst.addComponent(Health);
    health.setMaxHealth(150);

    const combat = inst.addComponent(Combat);
    combat.baseDamage = 34;
    combat.attackPeriod = 0.5;

    inst.addComponent(Inventory);
    inst.addComponent(Locomotor);
    inst.addComponent(Transform).setPosition(0, 0, 0); // Player starts at (0, 0)
    inst.setStateGraph(new StateGraph(SGPlayer));

    // Fast Forward Player's attack cooldown so they can attack instantly
    (combat as any).timeSinceLastAttack = 999;

    inst.listenForEvent("attacked", (data: { damage: number }) => {
        console.log(`=> [Player] Ouch! Took ${data.damage} damage. Health: ${health.currentHealth}`);
    });

    inst.listenForEvent("death", () => {
        console.log("=> [Player] I am dead.");
    });

    return inst;
}

function createSpider(targetPlayer: Entity): Entity {
    const inst = new Entity();
    inst.prefabName = "Spider";
    inst.addTag(EntityTag.Monster | EntityTag.Spider);

    const health = inst.addComponent(Health);
    health.setMaxHealth(100);

    const combat = inst.addComponent(Combat);
    combat.baseDamage = 20;
    combat.attackPeriod = 2.0;

    inst.addComponent(Locomotor);
    inst.addComponent(Transform).setPosition(10, 0, 0); // Spider starts at (10, 0), requires walking to reach player at (0,0)

    // Attaching the StateGraph to the Spider
    const spiderSG = new StateGraph(SGSpider);
    inst.setStateGraph(spiderSG);

    // Fast Forward combat cooldown
    (combat as any).timeSinceLastAttack = 999;

    // Attach AI Brain
    const spiderBrain = new Brain();
    spiderBrain.setRoot(new PriorityNode([
        new ChaseAndAttack(inst, 8, 20, undefined, (agent) => {
            const agentT = agent.getComponent(Transform);
            const playerT = targetPlayer.getComponent(Transform);
            if (!agentT || !playerT) return null;

            const dx = agentT.x - playerT.x;
            const dz = agentT.z - playerT.z;
            const distSq = dx * dx + dz * dz;

            return distSq < 225 ? targetPlayer : null;
        })
    ], 1.0)); // Evaluates new priorities every 1.0 second
    inst.setBrain(spiderBrain);

    return inst;
}

function createBerry(): Entity {
    const inst = new Entity();
    inst.prefabName = "berries";

    const item = inst.addComponent(Item);
    item.displayName = "Berries";
    item.stackSize = 1;

    inst.addComponent(Transform).setPosition(3, 0, 0);

    inst.listenForEvent("pickedup", () => {
        console.log("=> [World] Berries picked up and removed from the world.");
    });

    return inst;
}

// ============================================
// 2. Run Example Simulation
// ============================================

console.log("--- Initializing Game World ---");
const player = createPlayer();
const spider = createSpider(player);
const berries = createBerry();
const playerLocomotor = player.requireComponent(Locomotor);

console.log("\n--- Starting Action ---");
console.log("\n[Time: 0.0s] Player receives a pickup command for nearby berries. Spider will also detect the player and attack.");

playerLocomotor.pushAction(new BufferedAction(player, ACTIONS.PICKUP, berries));

// Run the tick simulation automatically
for (let step = 1; step <= 16; step++) {
    console.log(`\n[Time: ${(step * 0.5).toFixed(1)}s] Tick...`);
    
    // 1. SGManager handles animation events, timelines, and state updates
    SGManager.getInstance().update(0.5);

    // 2. BrainManager takes the fresh stategraph information and thinks
    BrainManager.getInstance().update(0.5);

    // 3. Components like Locomotor handle generic updates
    spider.update(0.5); 
    player.update(0.5);
}

const inventory = player.requireComponent(Inventory);
console.log("\n--- Final Inventory ---");
for (const slot of inventory.getItems()) {
    console.log(`[Inventory] ${slot.displayName} x${slot.count}`);
}

console.log("\n--- Simulation Ended ---");
