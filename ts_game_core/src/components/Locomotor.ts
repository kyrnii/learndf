import { Component } from "../core/Component";
import { Entity } from "../core/Entity";
import { BufferedAction } from "../core/Action";
import { StateGraph } from "./StateGraph";
import { Transform } from "./Transform";

export class Locomotor extends Component {
    public bufferedAction: BufferedAction | null = null;
    
    public walkSpeed: number = 3.0; // Units per second
    public runSpeed: number = 5.0;

    public destTarget: Entity | null = null;
    public destPos: {x: number, z: number} | null = null;

    public onAdd(): void {
        // Needs to update every frame to move the entity
        this.inst.startUpdatingComponent(this);

        // Listen for the generic "action_frame" from any animation StateGraph
        this.inst.listenForEvent("action_frame", () => {
            this.performBufferedAction();
        });
    }

    public update(dt: number): void {
        const transform = this.inst.getComponent(Transform);
        if (!transform) return;

        // Active pathing towards buffered action
        if (this.bufferedAction) {
            const act = this.bufferedAction;
            let targetX: number | null = null;
            let targetZ: number | null = null;

            if (act.target) {
                const targetTransform = act.target.getComponent(Transform);
                if (targetTransform) {
                    targetX = targetTransform.x;
                    targetZ = targetTransform.z;
                }
            } else if (act.pos) {
                targetX = act.pos.x;
                targetZ = act.pos.z;
            }

            if (targetX !== null && targetZ !== null) {
                const distSq = transform.getDistanceSqToPoint(targetX, targetZ);
                const requiredDist = act.action.distance;

                if (distSq <= requiredDist * requiredDist) {
                    // We've arrived at the interaction distance!
                    this.destTarget = null;
                    this.destPos = null;
                    
                    const sgc = this.inst.getComponent(StateGraph);
                    if (sgc && act.action.sgState) {
                        sgc.goToState(act.action.sgState, act);
                    } else if (!sgc || !act.action.sgState) {
                        // If no StateGraph or specific state, perform it immediately
                        this.performBufferedAction();
                    }
                    return; // Stop applying movement this tick
                }

                // Still out of range, calculate movement vector
                const dx = targetX - transform.x;
                const dz = targetZ - transform.z;
                const len = Math.sqrt(dx * dx + dz * dz);
                
                // Move towards target
                const speed = this.walkSpeed; 
                const moveDist = speed * dt;
                
                // Clamp to prevent jittering/overshooting
                if (len <= moveDist) {
                    transform.x = targetX;
                    transform.z = targetZ;
                } else {
                    transform.x += (dx / len) * moveDist;
                    transform.z += (dz / len) * moveDist;
                }
                
                console.log(`[Locomotor: ${this.inst.prefabName}] Walking... pos: (${transform.x.toFixed(1)}, ${transform.z.toFixed(1)})`);
            }
        }
    }

    public pushAction(action: BufferedAction): void {
        this.bufferedAction = action;
        
        const transform = this.inst.getComponent(Transform);
        const sgc = this.inst.getComponent(StateGraph);
        if (!transform) return;

        let targetX: number | null = null;
        let targetZ: number | null = null;

        if (action.target) {
            this.destTarget = action.target;
            const targetTransform = action.target.getComponent(Transform);
            if (targetTransform) {
                targetX = targetTransform.x;
                targetZ = targetTransform.z;
            }
        } else if (action.pos) {
            this.destPos = action.pos;
            targetX = action.pos.x;
            targetZ = action.pos.z;
        }

        if (targetX !== null && targetZ !== null) {
            const distSq = transform.getDistanceSqToPoint(targetX, targetZ);
            const requiredDist = action.action.distance;

            if (distSq <= requiredDist * requiredDist) {
                // Already in range. Perform immediately or enter attack state.
                if (sgc && action.action.sgState) {
                    sgc.goToState(action.action.sgState, action);
                } else {
                    this.performBufferedAction();
                }
            } else {
                // Out of range. Enter walking state to reach destination.
                if (sgc) {
                    sgc.goToState("walk");
                }
            }
        }
    }

    public performBufferedAction(): boolean {
        if (!this.bufferedAction) return false;
        
        const act = this.bufferedAction;
        this.bufferedAction = null; 
        this.destTarget = null;
        this.destPos = null;
        
        return act.action.fn(act);
    }
}
