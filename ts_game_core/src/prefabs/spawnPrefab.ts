import { Transform } from "../components/Transform";
import { Entity } from "../core/Entity";
import { PrefabDef, PrefabSpawnContext } from "./PrefabDef";
import { PrefabRegistry } from "./PrefabRegistry";

function resolvePrefab<TData>(
    registryOrPrefab: PrefabRegistry | PrefabDef<TData>,
    name?: string,
): PrefabDef<TData> {
    if (registryOrPrefab instanceof PrefabRegistry) {
        if (!name) {
            throw new Error("Prefab name is required when spawning from a registry.");
        }
        const prefab = registryOrPrefab.get<TData>(name);
        if (!prefab) {
            throw new Error(`Prefab '${name}' not found.`);
        }
        return prefab;
    }

    return registryOrPrefab;
}

export function spawnPrefab<TData = unknown>(
    registryOrPrefab: PrefabRegistry | PrefabDef<TData>,
    nameOrContext?: string | PrefabSpawnContext<TData>,
    maybeContext?: PrefabSpawnContext<TData>,
): Entity {
    const prefab = resolvePrefab<TData>(
        registryOrPrefab,
        typeof nameOrContext === "string" ? nameOrContext : undefined,
    );
    const context = (typeof nameOrContext === "string" ? maybeContext : nameOrContext) ?? {};

    const inst = new Entity();
    inst.setPrefabId(prefab.name);
    inst.prefabName = prefab.displayName ?? prefab.name;

    if (prefab.tags !== undefined) {
        inst.addTag(prefab.tags);
    }

    if (prefab.components) {
        for (const entry of prefab.components) {
            if (typeof entry === "function") {
                inst.addComponent(entry);
                continue;
            }

            const component = inst.addComponent(entry.component);
            entry.setup?.(component, inst, context as PrefabSpawnContext);
        }
    }

    let transform = inst.getComponent(Transform);
    if (context.position) {
        transform = transform ?? inst.addComponent(Transform);
        transform.setPosition(
            context.position.x,
            context.position.y ?? 0,
            context.position.z,
        );
    }

    prefab.setup?.(inst, context);

    const stateGraph = prefab.createStateGraph?.(inst, context) ?? null;
    if (stateGraph) {
        inst.setStateGraph(stateGraph);
    }

    const brain = prefab.createBrain?.(inst, context) ?? null;
    if (brain) {
        inst.setBrain(brain);
    }

    if (context.world) {
        context.world.addEntity(inst, context.map ?? null);
    }

    const physicsDef = prefab.createPhysics?.(inst, context) ?? null;
    if (physicsDef && physicsDef.attachOnSpawn !== false && context.world?.physics) {
        const bodyTransform = inst.getComponent(Transform) ?? inst.addComponent(Transform);
        context.world.physics.attach(inst, {
            type: physicsDef.type,
            shape: physicsDef.shape,
            layer: physicsDef.layer,
            isTrigger: physicsDef.isTrigger,
            transform: {
                position: {
                    x: bodyTransform.x,
                    y: bodyTransform.y,
                    z: bodyTransform.z,
                },
                rotation: {
                    x: 0,
                    y: bodyTransform.rotation,
                    z: 0,
                },
            },
        });
    }

    return inst;
}
