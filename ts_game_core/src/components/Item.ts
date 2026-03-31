import { Component } from "../core/Component";
import { Inventory } from "./Inventory";

export class Item extends Component {
    public displayName: string = "Unknown Item";
    public stackSize: number = 1;
    public canPickup: boolean = true;

    public pickup(doerInventory: Inventory): boolean {
        if (!this.canPickup || !this.inst.isValid) {
            return false;
        }

        doerInventory.addItem(this.inst.prefabName, this.displayName, this.stackSize);
        this.inst.pushEvent("pickedup");
        this.inst.remove();
        return true;
    }
}
