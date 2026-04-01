import { PrefabDef } from "./PrefabDef";

export class PrefabRegistry {
    private readonly prefabs: Map<string, PrefabDef> = new Map();

    public register<TData>(prefab: PrefabDef<TData>): void {
        this.prefabs.set(prefab.name, prefab as PrefabDef);
    }

    public get<TData = unknown>(name: string): PrefabDef<TData> | null {
        return (this.prefabs.get(name) as PrefabDef<TData> | undefined) ?? null;
    }

    public has(name: string): boolean {
        return this.prefabs.has(name);
    }
}
