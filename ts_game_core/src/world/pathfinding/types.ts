import { MapContext } from "../MapContext";
import { FindPathOptions } from "../layers";

export interface PathfindInput {
    from: { x: number; z: number };
    to: { x: number; z: number };
    map?: MapContext | string | null;
    options?: FindPathOptions;
}

export type PathRequestStatus = "pending" | "ready" | "failed" | "cancelled";

export interface PathRequestSnapshot {
    id: number;
    status: PathRequestStatus;
    input: PathfindInput;
    path: Array<{ x: number; z: number }> | null;
}

export interface IPathfinderBackend {
    submit(input: PathfindInput): number;
    cancel(requestId: number): void;
    get(requestId: number): PathRequestSnapshot | null;
    update(dt: number): void;
}
