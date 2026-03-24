import { Entity } from './core/Entity';
import { Health } from './components/Health';
import { Combat } from './components/Combat';
import { StateGraph } from './components/StateGraph';
import { SGSpider } from './stategraphs/SGSpider';
import { EntityTag } from './core/Tags';
import { Locomotor } from './components/Locomotor';
import { BufferedAction, ACTIONS } from './core/Action';
import { Transform } from './components/Transform';

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

    inst.addComponent(Locomotor);
    inst.addComponent(Transform).setPosition(0, 0, 0); // Player starts at (0, 0)

    // Fast Forward Player's attack cooldown so they can attack instantly
    (combat as any).timeSinceLastAttack = 999;

    inst.listenForEvent("attacked", (data: { damage: number }) => {
        console.log(`=> [Player] Ouch! Took ${data.damage} damage. Health: ${health.currentHealth}`);
    });

    return inst;
}

function createSpider(): Entity {
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
    const sgc = inst.addComponent(StateGraph);
    sgc.setStateGraph(SGSpider); // Enters default "idle"

    // Fast Forward combat cooldown
    (combat as any).timeSinceLastAttack = 999;

    return inst;
}

// ============================================
// 2. Run Example Simulation
// ============================================

console.log("--- Initializing Game World ---");
const player = createPlayer();
const spider = createSpider();

console.log("\n--- Starting Action ---");

console.log("\n[Time: 0.0s] Spider spots player, decides to attack...");
// Player is at x:0, Spider is at x:10. Required distance is 2.0. So spider will walk until dist<=2.0.
spider.getComponent(Locomotor)?.pushAction(new BufferedAction(spider, ACTIONS.ATTACK, player));

console.log("\n[Time: 1.0s] Tick... Spider walks towards Player...");
spider.update(1.0); // Spider moves from 10 to 7 (Speed is 3)

console.log("\n[Time: 2.0s] Tick... Spider keeps walking...");
spider.update(1.0); // Spider moves from 7 to 4

console.log("\n[Time: 3.0s] Tick... Spider arrives in attack range (dist <= 2)!");
spider.update(1.0); // Spider moves from 4 to 2, reaches range, enters 'attack' state

console.log("\n[Time: 3.5s] Tick... Spider hits animation 'hit frame' at 0.5s into attack.");
spider.update(0.5); // Hits 0.5s attack frame -> perform action!

console.log("\n--- Simulation Ended ---");
