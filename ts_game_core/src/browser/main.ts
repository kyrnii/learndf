import { Locomotor } from "../components/Locomotor";
import { Transform } from "../components/Transform";
import { createExampleGame } from "../examples/createExampleGame";
import { PixiWorldRenderer } from "../render";
import { NavAgentSize } from "../world";

function createToggle(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
    const wrapper = document.createElement("label");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "6px";
    wrapper.style.marginRight = "12px";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));

    const text = document.createElement("span");
    text.textContent = label;

    wrapper.appendChild(input);
    wrapper.appendChild(text);
    return wrapper;
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.marginRight = "8px";
    button.style.marginTop = "6px";
    button.addEventListener("click", onClick);
    return button;
}

async function main(): Promise<void> {
    const root = document.getElementById("app");
    if (!root) {
        throw new Error("Missing #app container.");
    }

    const renderer = new PixiWorldRenderer();
    await renderer.mount(root);

    const game = await createExampleGame();
    game.startScenario();

    const hud = document.createElement("div");
    hud.className = "hud";
    root.appendChild(hud);

    const info = document.createElement("div");
    hud.appendChild(info);

    const controls = document.createElement("div");
    controls.style.marginTop = "8px";
    controls.style.paddingTop = "8px";
    controls.style.borderTop = "1px solid rgba(0,0,0,0.12)";
    hud.appendChild(controls);

    const selectedAgentSizes = new Set<NavAgentSize>(["small"]);
    let currentSpider = game.spider;
    let spiderLocomotor = currentSpider.requireComponent(Locomotor);
    let spiderTransform = currentSpider.requireComponent(Transform);
    const syncRendererDebug = (): void => {
        renderer.setDebugOptions({
            visibleAgentSizes: Array.from(selectedAgentSizes),
        });
    };

    controls.appendChild(createToggle("显示 NavMesh", true, (checked) => {
        renderer.setDebugOptions({ showNavMesh: checked });
    }));
    controls.appendChild(createToggle("显示占用", true, (checked) => {
        renderer.setDebugOptions({ showOccupancy: checked });
    }));
    controls.appendChild(createToggle("显示静态刚体", true, (checked) => {
        renderer.setDebugOptions({ showStaticPhysics: checked });
    }));
    controls.appendChild(createToggle("显示 Portal", true, (checked) => {
        renderer.setDebugOptions({ showPortals: checked });
    }));
    controls.appendChild(createToggle("显示路径", true, (checked) => {
        renderer.setDebugOptions({ showPaths: checked });
    }));
    controls.appendChild(document.createElement("br"));

    (["small", "medium", "large"] as NavAgentSize[]).forEach((agentSize) => {
        controls.appendChild(createToggle(`体型 ${agentSize}`, agentSize === "small", (checked) => {
            if (checked) {
                selectedAgentSizes.add(agentSize);
            } else {
                selectedAgentSizes.delete(agentSize);
            }

            if (selectedAgentSizes.size === 0) {
                selectedAgentSizes.add("small");
            }
            syncRendererDebug();
        }));
    });

    controls.appendChild(document.createElement("br"));
    (["small", "medium", "large"] as NavAgentSize[]).forEach((agentSize) => {
        controls.appendChild(createButton(`蜘蛛=${agentSize}`, () => {
            currentSpider = game.respawnSpider(agentSize);
            spiderLocomotor = currentSpider.requireComponent(Locomotor);
            spiderTransform = currentSpider.requireComponent(Transform);
        }));
    });

    syncRendererDebug();

    let lastTime = performance.now();
    let accumulator = 0;
    const fixedDt = 1 / 30;

    const updateHud = (): void => {
        const playerTransform = game.player.requireComponent(Transform);
        info.innerHTML = [
            `<strong>ts_game_core 浏览器预览</strong>`,
            `玩家位置: ${playerTransform.x.toFixed(2)}, ${playerTransform.z.toFixed(2)}`,
            `蜘蛛位置: ${spiderTransform.x.toFixed(2)}, ${spiderTransform.z.toFixed(2)}`,
            `调试体型: ${Array.from(selectedAgentSizes).join(", ")}`,
            `蜘蛛寻路体型: ${spiderLocomotor.navAgentSize}`,
        ].join("<br>");
    };

    const tick = (now: number): void => {
        const frameDt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        accumulator += frameDt;

        while (accumulator >= fixedDt) {
            game.step(fixedDt);
            accumulator -= fixedDt;
        }

        renderer.render(game.world);
        updateHud();
        requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);

    window.addEventListener("beforeunload", () => {
        renderer.destroy();
        game.destroy();
    });
}

void main();
