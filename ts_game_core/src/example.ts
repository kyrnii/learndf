import { Inventory } from "./components/Inventory";
import { createExampleGame } from "./examples/createExampleGame";

async function main(): Promise<void> {
    console.log("--- Initializing Game World ---");
    const game = await createExampleGame();

    game.startScenario();

    for (let step = 1; step <= 16; step++) {
        console.log(`\n[Time: ${(step * 0.5).toFixed(1)}s] Tick...`);
        game.step(0.5);
    }

    const inventory = game.player.requireComponent(Inventory);
    console.log("\n--- Final Inventory ---");
    for (const slot of inventory.getItems()) {
        console.log(`[Inventory] ${slot.displayName} x${slot.count}`);
    }

    console.log("\n--- Simulation Ended ---");
    game.destroy();
}

void main();
