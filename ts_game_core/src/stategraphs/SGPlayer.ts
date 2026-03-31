import { StateGraphDef, StateGraphConfig, State } from "../core/StateCore";
import { StateTag } from "../core/Tags";

export const sg_player_config: StateGraphConfig = {
    defaultState: "idle",
    events: [
        {
            name: "death",
            fn: (inst) => {
                inst.sg?.goToState("death");
            }
        }
    ],
    states: [
        new State({
            name: "idle",
            tags: StateTag.Idle | StateTag.CanRotate,
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] Enter 'idle'`);
            }
        }),
        new State({
            name: "walk",
            tags: StateTag.Busy | StateTag.CanRotate,
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] Enter 'walk'`);
            }
        }),
        new State({
            name: "pickup",
            tags: StateTag.Busy,
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] Start 'pickup' animation`);
            },
            timeline: [
                {
                    time: 0.2,
                    fn: (inst) => {
                        console.log(`[SG: ${inst.prefabName}] Pickup frame`);
                        inst.pushEvent("action_frame");
                    }
                },
                {
                    time: 0.4,
                    fn: (inst) => {
                        inst.sg?.goToState("idle");
                    }
                }
            ]
        }),
        new State({
            name: "death",
            tags: StateTag.Busy | StateTag.Dead,
            excludeTags: StateTag.Dead,
            onEnter: (inst) => {
                console.log(`[SG: ${inst.prefabName}] Enter 'death'`);
            }
        })
    ]
};

export const SGPlayer = new StateGraphDef(sg_player_config);
