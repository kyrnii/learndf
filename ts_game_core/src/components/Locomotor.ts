import { Component } from "../core/Component";
import { Entity } from "../core/Entity";
import { BufferedAction } from "../core/Action";
import { Transform } from "./Transform";

export class Locomotor extends Component {
    public bufferedAction: BufferedAction | null = null;
    
    public walkSpeed: number = 3.0; // Units per second
    public runSpeed: number = 5.0;

    public destTarget: Entity | null = null;
    public destPos: {x: number, z: number} | null = null;
    private movingDirectly: boolean = false;
    private directRun: boolean = false;
    private arriveDistance: number = 0.1;

    public onAdd(): void {
        this.inst.startUpdatingComponent(this);

        this.inst.listenForEvent("action_frame", () => {
            this.performBufferedAction();
        });
    }

    public update(dt: number): void {
        const transform = this.inst.getComponent(Transform);
        if (!transform) return;

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
                    this.destTarget = null;
                    this.destPos = null;
                    
                    const sgc = this.inst.sg;
                    if (sgc && act.action.sgState) {
                        if (sgc.currentState?.name !== act.action.sgState) {
                            sgc.goToState(act.action.sgState, act);
                        }
                    } else if (!sgc || !act.action.sgState) {
                        this.performBufferedAction();
                    }
                    return;
                }

                const dx = targetX - transform.x;
                const dz = targetZ - transform.z;
                const len = Math.sqrt(dx * dx + dz * dz);
                
                const speed = this.walkSpeed; 
                const moveDist = speed * dt;
                
                if (len <= moveDist) {
                    transform.x = targetX;
                    transform.z = targetZ;
                } else {
                    transform.x += (dx / len) * moveDist;
                    transform.z += (dz / len) * moveDist;
                }
                
                console.log(`[Locomotor: ${this.inst.prefabName}] Walking... pos: (${transform.x.toFixed(1)}, ${transform.z.toFixed(1)})`);
            }
        } else if (this.movingDirectly && this.destPos) {
            const dx = this.destPos.x - transform.x;
            const dz = this.destPos.z - transform.z;
            const distSq = dx * dx + dz * dz;

            if (distSq <= this.arriveDistance * this.arriveDistance) {
                this.stop();
                return;
            }

            const len = Math.sqrt(distSq);
            const speed = this.directRun ? this.runSpeed : this.walkSpeed;
            const moveDist = speed * dt;

            if (len <= moveDist) {
                transform.x = this.destPos.x;
                transform.z = this.destPos.z;
                this.stop();
            } else {
                transform.x += (dx / len) * moveDist;
                transform.z += (dz / len) * moveDist;
            }

            console.log(`[Locomotor: ${this.inst.prefabName}] Moving... pos: (${transform.x.toFixed(1)}, ${transform.z.toFixed(1)})`);
        }
    }

    public isDoingAction(actionId: string, target: Entity | null): boolean {
        if (!this.bufferedAction) return false;
        return this.bufferedAction.action.id === actionId && this.bufferedAction.target === target;
    }

    public pushAction(action: BufferedAction): void {
        this.bufferedAction = action;
        this.movingDirectly = false;
        
        const transform = this.inst.getComponent(Transform);
        const sgc = this.inst.sg;
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
                if (sgc && action.action.sgState) {
                    sgc.goToState(action.action.sgState, action);
                } else {
                    this.performBufferedAction();
                }
            } else {
                if (sgc) {
                    sgc.goToState("walk");
                }
            }
        }
    }

    public goToPoint(pos: { x: number; z: number }, run: boolean = false, arriveDistance: number = 0.1): void {
        this.bufferedAction = null;
        this.destTarget = null;
        this.destPos = { ...pos };
        this.movingDirectly = true;
        this.directRun = run;
        this.arriveDistance = arriveDistance;
        this.inst.sg?.goToState("walk");
    }

    public stop(): void {
        this.destTarget = null;
        this.destPos = null;
        this.movingDirectly = false;
        this.directRun = false;

        if (this.inst.sg?.currentState?.name === "walk") {
            this.inst.sg.goToState("idle");
        }
    }

    public wantsToMoveForward(): boolean {
        return this.bufferedAction !== null || this.movingDirectly;
    }

    public isMoving(): boolean {
        return this.wantsToMoveForward();
    }

    public performBufferedAction(): boolean {
        if (!this.bufferedAction) return false;
        
        const act = this.bufferedAction;
        this.bufferedAction = null; 
        this.destTarget = null;
        this.destPos = null;
        
        const result = act.action.fn(act);
        if (result) {
            act.succeed();
        } else {
            act.fail();
        }
        return result;
    }
}
