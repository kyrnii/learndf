import { Locomotor } from "../components/Locomotor";
import { BufferedAction, ACTIONS } from "../core/Action";
import { Entity } from "../core/Entity";
import { JsPhysicsBackend, Physics } from "../physics";
import { PrefabRegistry, spawnPrefab } from "../prefabs";
import { NavAgentSize, WalkableMap, World } from "../world";
import { createExamplePrefabRegistry } from "./examplePrefabs";

export const EXAMPLE_PLAYER_SPAWN = { x: -8, z: -6 };
export const EXAMPLE_SPIDER_SPAWN = { x: 12, z: 8 };
export const EXAMPLE_BERRIES_SPAWN = { x: -3, z: -6 };

const EXAMPLE_OBSTACLE_POSITIONS = [
    // 第一堵墙：small 可走 1 格门；medium / large 需要从下方绕。
    { x: -1, z: -2 },
    { x: -1, z: -1 },
    { x: -1, z: 0 },
    { x: -1, z: 1 },
    { x: -1, z: 2 },
    { x: -1, z: 3 },
    { x: -1, z: 5 },
    { x: -1, z: 6 },
    { x: -1, z: 7 },
    { x: -1, z: 8 },
    { x: -1, z: 9 },
    { x: -1, z: 10 },
    { x: -1, z: 11 },
    { x: -1, z: 12 },
    // 第二堵墙：medium 可走 3 格门；large 继续从下方大绕路。
    { x: 5, z: -8 },
    { x: 5, z: -7 },
    { x: 5, z: -6 },
    { x: 5, z: -5 },
    { x: 5, z: -4 },
    { x: 5, z: -3 },
    { x: 5, z: -2 },
    { x: 5, z: -1 },
    { x: 5, z: 0 },
    { x: 5, z: 1 },
    { x: 5, z: 5 },
    { x: 5, z: 6 },
    { x: 5, z: 7 },
    { x: 5, z: 8 },
    { x: 5, z: 9 },
    { x: 5, z: 10 },
    { x: 5, z: 11 },
    { x: 5, z: 12 },
];

export interface ExampleGame {
    world: World;
    physics: Physics;
    prefabs: PrefabRegistry;
    player: Entity;
    spider: Entity;
    berries: Entity;
    obstacles: Entity[];
    respawnSpider(agentSize?: NavAgentSize): Entity;
    startScenario(): void;
    step(dt: number): void;
    destroy(): void;
}

export async function createExampleGame(): Promise<ExampleGame> {
    const world = new World(new WalkableMap(1, {
        minX: -20,
        maxX: 20,
        minZ: -20,
        maxZ: 20,
    }));
    const physicsBackend = await JsPhysicsBackend.create();
    const physics = new Physics(physicsBackend);
    world.setPhysics(physics);

    const prefabs = createExamplePrefabRegistry();
    const player = spawnPrefab(prefabs, "player", {
        world,
        position: EXAMPLE_PLAYER_SPAWN,
    });
    let spider = spawnPrefab(prefabs, "spider", {
        world,
        position: EXAMPLE_SPIDER_SPAWN,
        data: { targetPlayer: player },
    });
    const berries = spawnPrefab(prefabs, "berries", {
        world,
        position: EXAMPLE_BERRIES_SPAWN,
    });
    const obstacles = EXAMPLE_OBSTACLE_POSITIONS.map((position) => (
        spawnPrefab(prefabs, "rock_obstacle", {
            world,
            position,
        })
    ));

    spider.requireComponent(Locomotor).navAgentSize = "small";

    const api: ExampleGame = {
        world,
        physics,
        prefabs,
        player,
        spider,
        berries,
        obstacles,
        respawnSpider(agentSize: NavAgentSize = "small"): Entity {
            if (spider.isValid) {
                spider.remove();
            }

            spider = spawnPrefab(prefabs, "spider", {
                world,
                position: EXAMPLE_SPIDER_SPAWN,
                data: { targetPlayer: player },
            });
            spider.requireComponent(Locomotor).navAgentSize = agentSize;
            api.spider = spider;
            return spider;
        },
        startScenario(): void {
            const playerLocomotor = player.requireComponent(Locomotor);
            console.log("\n--- Starting Action ---");
            console.log("\n[Time: 0.0s] Player receives a pickup command for nearby berries. Spider will also detect the player and attack.");
            playerLocomotor.pushAction(new BufferedAction(player, ACTIONS.PICKUP, berries));
        },
        step(dt: number): void {
            world.update(dt);
        },
        destroy(): void {
            physics.destroy();
        },
    };

    return api;
}
