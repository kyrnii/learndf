import { IPhysicsBackend } from "./backend";
import { PhysicsBody } from "./PhysicsBody";
import {
    KinematicMoveInput,
    OverlapHit,
    OverlapSphereInput,
    PhysicsBodyDesc,
    PhysicsBodyId,
    PhysicsWorldConfig,
    PhysicsWorldId,
    RaycastHit,
    RaycastInput,
} from "./types";

export class PhysicsWorld {
    private readonly bodyIds: Set<PhysicsBodyId> = new Set();

    constructor(
        private readonly backend: IPhysicsBackend,
        public readonly id: PhysicsWorldId,
        public readonly config: PhysicsWorldConfig,
    ) {}

    public createBody(desc: PhysicsBodyDesc): PhysicsBody {
        const bodyId = this.backend.createBody(this.id, desc);
        this.bodyIds.add(bodyId);
        return new PhysicsBody(this.backend, this.id, bodyId, desc);
    }

    public destroyBody(body: PhysicsBody): void {
        if (!this.bodyIds.has(body.id)) {
            return;
        }
        this.backend.destroyBody(this.id, body.id);
        this.bodyIds.delete(body.id);
    }

    public step(dt: number): void {
        this.backend.step(this.id, dt);
    }

    public moveKinematic(input: KinematicMoveInput): void {
        this.backend.moveKinematic(this.id, input);
    }

    public raycast(input: RaycastInput): RaycastHit | null {
        return this.backend.raycast(this.id, input);
    }

    public overlapSphere(input: OverlapSphereInput): OverlapHit[] {
        return this.backend.overlapSphere(this.id, input);
    }

    public destroy(): void {
        this.backend.destroyWorld(this.id);
        this.bodyIds.clear();
    }
}
