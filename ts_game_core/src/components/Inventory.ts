import { Component } from "../core/Component";

export interface InventorySlot {
    prefabName: string;
    displayName: string;
    count: number;
}

export class Inventory extends Component {
    private slots: Map<string, InventorySlot> = new Map();

    public addItem(prefabName: string, displayName: string, count: number = 1): void {
        const existing = this.slots.get(prefabName);
        if (existing) {
            existing.count += count;
            return;
        }

        this.slots.set(prefabName, {
            prefabName,
            displayName,
            count,
        });
    }

    public getCount(prefabName: string): number {
        return this.slots.get(prefabName)?.count ?? 0;
    }

    public getItems(): InventorySlot[] {
        return Array.from(this.slots.values()).map((slot) => ({ ...slot }));
    }

    public serialize(): unknown {
        return {
            items: this.getItems(),
        };
    }

    public deserialize(data: unknown): void {
        if (!data || typeof data !== "object") {
            return;
        }

        const save = data as Partial<{ items: InventorySlot[] }>;
        this.slots.clear();
        for (const item of save.items ?? []) {
            this.slots.set(item.prefabName, { ...item });
        }
    }
}
