import { World } from "../World";
import { IPathfinderBackend, PathfindInput, PathRequestSnapshot } from "./types";

// 主线程寻路后端：接口异步化，但先在 world tick 中分帧计算，方便后续切到 Worker/原生实现。
export class MainThreadPathfinder implements IPathfinderBackend {
    private nextRequestId = 1;
    private readonly pendingOrder: number[] = [];
    private readonly requests: Map<number, PathRequestSnapshot> = new Map();

    constructor(private readonly world: World) {}

    public submit(input: PathfindInput): number {
        const id = this.nextRequestId++;
        this.requests.set(id, {
            id,
            status: "pending",
            input,
            path: null,
        });
        this.pendingOrder.push(id);
        return id;
    }

    public cancel(requestId: number): void {
        const request = this.requests.get(requestId);
        if (!request || request.status !== "pending") {
            return;
        }

        request.status = "cancelled";
    }

    public get(requestId: number): PathRequestSnapshot | null {
        const request = this.requests.get(requestId);
        return request
            ? {
                id: request.id,
                status: request.status,
                input: {
                    ...request.input,
                    from: { ...request.input.from },
                    to: { ...request.input.to },
                },
                path: request.path?.map((point) => ({ ...point })) ?? null,
            }
            : null;
    }

    public update(_dt: number): void {
        if (this.pendingOrder.length === 0) {
            return;
        }

        const requestId = this.pendingOrder.shift();
        if (requestId === undefined) {
            return;
        }

        const request = this.requests.get(requestId);
        if (!request || request.status !== "pending") {
            return;
        }

        const path = this.world.findPathImmediate(
            request.input.from,
            request.input.to,
            request.input.options,
            request.input.map ?? null,
        );

        request.path = path;
        request.status = path && path.length > 0 ? "ready" : "failed";
    }
}
