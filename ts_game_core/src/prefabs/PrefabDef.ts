import { Component } from "../core/Component";
import { Entity, ComponentConstructor } from "../core/Entity";
import { Brain } from "../core/behavior/Brain";
import { StateGraph } from "../core/stategraph/StateGraph";
import { TagQuery } from "../core/Tags";
import { PhysicsBodyDesc } from "../physics/core/types";
import { MapContext, World } from "../world";

export interface PrefabSpawnContext<TData = unknown> {
    world?: World | null;
    map?: MapContext | string | null;
    position?: { x: number; y?: number; z: number } | null;
    data?: TData;
}

export interface PrefabPhysicsDef {
    type: PhysicsBodyDesc["type"];
    shape: PhysicsBodyDesc["shape"];
    layer?: PhysicsBodyDesc["layer"];
    isTrigger?: boolean;
    attachOnSpawn?: boolean;
}

export interface PrefabComponentDef<T extends Component = Component> {
    component: ComponentConstructor<T>;
    setup?: (component: T, inst: Entity, context: PrefabSpawnContext) => void;
}

export type PrefabComponentEntry =
    | ComponentConstructor<Component>
    | {
        component: ComponentConstructor<any>;
        setup?: (component: any, inst: Entity, context: PrefabSpawnContext) => void;
    };

export interface PrefabDef<TData = unknown> {
    name: string;
    displayName?: string;
    tags?: TagQuery;
    components?: PrefabComponentEntry[];
    setup?: (inst: Entity, context: PrefabSpawnContext<TData>) => void;
    createStateGraph?: (inst: Entity, context: PrefabSpawnContext<TData>) => StateGraph | null;
    createBrain?: (inst: Entity, context: PrefabSpawnContext<TData>) => Brain | null;
    createPhysics?: (inst: Entity, context: PrefabSpawnContext<TData>) => PrefabPhysicsDef | null;
}
