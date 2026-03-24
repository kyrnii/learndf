import { StateGraphDef, StateGraphConfig, State } from "../core/StateCore";
import { StateGraph } from "../components/StateGraph";
import { Entity } from "../core/Entity";
import { StateTag } from "../core/Tags";

export const sg_spider_config: StateGraphConfig = {
    defaultState: "idle",
    events: [
        {
            name: "attacked",
            fn: (inst, data) => {
                const sgc = inst.getComponent(StateGraph);
                if (sgc) sgc.goToState("hit");
            }
        },
        {
            name: "death",
            fn: (inst) => {
                const sgc = inst.getComponent(StateGraph);
                if (sgc) sgc.goToState("death");
            }
        }
    ],
    states: [
        new State({
            name: "idle",
            tags: StateTag.Idle | StateTag.CanRotate,
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] 🟢 Enter 'idle'`);
            }
        }),
        new State({
            name: "walk",
            tags: StateTag.Busy | StateTag.CanRotate,
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] 🚶 Plays 'walk' loop...`);
            }
        }),
        new State({
            name: "attack",
            tags: StateTag.Attack | StateTag.Busy,
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] ⚔️ Start 'attack' animation...`);
            },
            timeline: [
                {
                    time: 0.5, // 0.5s in, perform action
                    fn: (inst) => {
                        console.log(`[SG: ${inst.prefabName}] 💥 Hit frame! Broadcasting action_frame!`);
                        inst.pushEvent("action_frame");
                    }
                },
                {
                    time: 1.0, // 1.0s in, attack anim done
                    fn: (inst) => {
                        console.log(`[SG: ${inst.prefabName}] ✔️ Attack anim finished.`);
                        inst.getComponent(StateGraph)?.goToState("idle");
                    }
                }
            ]
        }),
        new State({
            name: "hit",
            tags: StateTag.Busy | StateTag.Hit,
            excludeTags: StateTag.Dead, // Cannot enter 'hit' if already 'Dead'
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] 🤕 Plays 'hit' animation!`);
            },
            timeline: [
                {
                    time: 0.3, // Recovers after 0.3s
                    fn: (inst) => {
                        console.log(`[SG: ${inst.prefabName}] ⚡ Recovered from hit.`);
                        inst.getComponent(StateGraph)?.goToState("idle");
                    }
                }
            ]
        }),
        new State({
            name: "death",
            tags: StateTag.Busy | StateTag.Dead,
            excludeTags: StateTag.Dead, // Prevent re-entering death
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] 💀 Plays 'death' animation... X_X`);
            }
        })
    ]
};

export const SGSpider = new StateGraphDef(sg_spider_config);
