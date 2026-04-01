import { Combat } from "../components/Combat";
import { Health } from "../components/Health";
import { Inventory } from "../components/Inventory";
import { Item } from "../components/Item";
import { Locomotor } from "../components/Locomotor";
import { Placeable } from "../components/Placeable";
import { Transform } from "../components/Transform";
import { ChaseAndAttack } from "../behaviors";
import { Brain } from "../core/behavior/Brain";
import { PriorityNode } from "../core/behavior/Composites";
import { Entity } from "../core/Entity";
import { StateGraph } from "../core/stategraph/StateGraph";
import { EntityTag } from "../core/Tags";
import { PrefabComponentDef, PrefabDef, PrefabRegistry } from "../prefabs";
import { SGPlayer } from "../stategraphs/SGPlayer";
import { SGSpider } from "../stategraphs/SGSpider";

export interface SpiderPrefabData {
    targetPlayer: Entity;
}

const playerPrefab: PrefabDef = {
    name: "player",
    displayName: "Player",
    tags: [EntityTag.Player, EntityTag.Character],
    components: [
        {
            component: Health,
            setup: (health) => {
                health.setMaxHealth(150);
            },
        } as PrefabComponentDef<Health>,
        {
            component: Combat,
            setup: (combat) => {
                combat.baseDamage = 34;
                combat.attackPeriod = 0.5;
                combat.setAttackCooldownElapsed(999);
            },
        } as PrefabComponentDef<Combat>,
        Inventory,
        Locomotor,
        Transform,
    ],
    setup: (inst) => {
        const health = inst.requireComponent(Health);
        inst.listenForEvent("attacked", (data: { damage: number }) => {
            console.log(`=> [Player] Ouch! Took ${data.damage} damage. Health: ${health.currentHealth}`);
        });
        inst.listenForEvent("death", () => {
            console.log("=> [Player] I am dead.");
        });
    },
    createStateGraph: () => new StateGraph(SGPlayer),
    createPhysics: () => ({
        type: "kinematic",
        shape: {
            type: "capsule",
            radius: 0.5,
            height: 1.8,
        },
    }),
};

const spiderPrefab: PrefabDef<SpiderPrefabData> = {
    name: "spider",
    displayName: "Spider",
    tags: [EntityTag.Monster, EntityTag.Spider],
    components: [
        {
            component: Health,
            setup: (health) => {
                health.setMaxHealth(100);
            },
        } as PrefabComponentDef<Health>,
        {
            component: Combat,
            setup: (combat) => {
                combat.baseDamage = 20;
                combat.attackPeriod = 2.0;
                combat.setAttackCooldownElapsed(999);
            },
        } as PrefabComponentDef<Combat>,
        Locomotor,
        Transform,
    ],
    createStateGraph: () => new StateGraph(SGSpider),
    createBrain: (inst, context) => {
        const targetPlayer = context.data?.targetPlayer;
        if (!targetPlayer) {
            return null;
        }

        const spiderBrain = new Brain();
        spiderBrain.setRoot(new PriorityNode([
            new ChaseAndAttack(inst, 10, 32, undefined, (agent) => {
                const agentT = agent.getComponent(Transform);
                const playerT = targetPlayer.getComponent(Transform);
                if (!agentT || !playerT) {
                    return null;
                }

                const dx = agentT.x - playerT.x;
                const dz = agentT.z - playerT.z;
                const distSq = dx * dx + dz * dz;
                return distSq < 32 * 32 ? targetPlayer : null;
            }),
        ], 1.0));
        return spiderBrain;
    },
    createPhysics: () => ({
        type: "kinematic",
        shape: {
            type: "capsule",
            radius: 0.45,
            height: 1.2,
        },
    }),
};

const berriesPrefab: PrefabDef = {
    name: "berries",
    displayName: "berries",
    components: [
        {
            component: Item,
            setup: (item) => {
                item.displayName = "Berries";
                item.stackSize = 1;
            },
        } as PrefabComponentDef<Item>,
        Transform,
    ],
    setup: (inst) => {
        inst.listenForEvent("pickedup", () => {
            console.log("=> [World] Berries picked up and removed from the world.");
        });
    },
};

const rockObstaclePrefab: PrefabDef = {
    name: "rock_obstacle",
    displayName: "rock_obstacle",
    components: [
        Transform,
        {
            component: Placeable,
            setup: (placeable) => {
                placeable.footprint = { width: 1, height: 1 };
                placeable.blockTerrainCell = true;
                placeable.createPhysicsObstacle = true;
            },
        } as PrefabComponentDef<Placeable>,
    ],
};

export function createExamplePrefabRegistry(): PrefabRegistry {
    const registry = new PrefabRegistry();
    registry.register(playerPrefab);
    registry.register(spiderPrefab);
    registry.register(berriesPrefab);
    registry.register(rockObstaclePrefab);
    return registry;
}
