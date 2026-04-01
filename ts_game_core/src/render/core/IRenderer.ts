import { World } from "../../world";

export interface IRenderer {
    mount(container: HTMLElement): Promise<void>;
    resize(width: number, height: number): void;
    render(world: World): void;
    destroy(): void;
}
