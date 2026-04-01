import { Application, ColorSource, Container, Graphics, Text } from "pixi.js";
import { Health } from "../../components/Health";
import { Locomotor } from "../../components/Locomotor";
import { Transform } from "../../components/Transform";
import { Entity } from "../../core/Entity";
import { EntityTag } from "../../core/Tags";
import { NavAgentSize, NavMeshDebugSnapshot, World } from "../../world";
import { IRenderer } from "../core/IRenderer";

interface EntityView {
    container: Container;
    body: Graphics;
    label: Text;
    healthBarBg?: Graphics;
    healthBarFill?: Graphics;
}

export interface PixiDebugOptions {
    showOccupancy: boolean;
    showStaticPhysics: boolean;
    showNavMesh: boolean;
    showPortals: boolean;
    showPaths: boolean;
    visibleAgentSizes: NavAgentSize[];
}

const DEFAULT_DEBUG_OPTIONS: PixiDebugOptions = {
    showOccupancy: true,
    showStaticPhysics: true,
    showNavMesh: true,
    showPortals: true,
    showPaths: true,
    visibleAgentSizes: ["small"],
};

const AGENT_DEBUG_COLORS: Record<NavAgentSize, { fill: string; line: string; portal: string }> = {
    small: {
        fill: "#5cb85c",
        line: "#2f7d32",
        portal: "#2f7d32",
    },
    medium: {
        fill: "#e0a22f",
        line: "#ab7314",
        portal: "#ab7314",
    },
    large: {
        fill: "#d86a5a",
        line: "#a53b30",
        portal: "#a53b30",
    },
};

export class PixiWorldRenderer implements IRenderer {
    private app: Application | null = null;
    private root: Container = new Container();
    private grid: Graphics = new Graphics();
    private debugLayer: Container = new Container();
    private occupancyGraphics: Graphics = new Graphics();
    private staticPhysicsGraphics: Graphics = new Graphics();
    private navMeshGraphics: Graphics = new Graphics();
    private portalGraphics: Graphics = new Graphics();
    private pathGraphics: Graphics = new Graphics();
    private entityViews: Map<number, EntityView> = new Map();
    private readonly worldScale = 32;
    private debugOptions: PixiDebugOptions = { ...DEFAULT_DEBUG_OPTIONS };

    public async mount(container: HTMLElement): Promise<void> {
        this.app = new Application();
        await this.app.init({
            resizeTo: container,
            background: "#f4f1e8",
            antialias: true,
        });

        container.appendChild(this.app.canvas);
        this.app.stage.addChild(this.root);
        this.root.addChild(this.grid);
        this.root.addChild(this.debugLayer);
        this.debugLayer.addChild(this.occupancyGraphics);
        this.debugLayer.addChild(this.staticPhysicsGraphics);
        this.debugLayer.addChild(this.navMeshGraphics);
        this.debugLayer.addChild(this.portalGraphics);
        this.debugLayer.addChild(this.pathGraphics);
    }

    public resize(width: number, height: number): void {
        this.app?.renderer.resize(width, height);
    }

    public setDebugOptions(options: Partial<PixiDebugOptions>): void {
        this.debugOptions = {
            ...this.debugOptions,
            ...options,
            visibleAgentSizes: options.visibleAgentSizes ?? this.debugOptions.visibleAgentSizes,
        };
    }

    public getDebugOptions(): PixiDebugOptions {
        return {
            ...this.debugOptions,
            visibleAgentSizes: [...this.debugOptions.visibleAgentSizes],
        };
    }

    public render(world: World): void {
        if (!this.app) {
            return;
        }

        this.drawGrid(world);
        this.drawDebug(world);

        const active = new Set<number>();
        for (const entity of world.getEntities()) {
            if (!entity.isValid) {
                continue;
            }

            const transform = entity.getComponent(Transform);
            if (!transform) {
                continue;
            }

            active.add(entity.GUID);
            const view = this.getOrCreateView(entity);
            const pos = this.worldToScreen(transform.x, transform.z, world);
            view.container.position.set(pos.x, pos.y);
            view.container.rotation = transform.rotation;
            view.label.text = entity.prefabName;
            this.updateHealthBar(entity, view);
        }

        for (const [guid, view] of this.entityViews) {
            if (!active.has(guid)) {
                view.container.destroy({ children: true });
                this.entityViews.delete(guid);
            }
        }
    }

    public destroy(): void {
        for (const view of this.entityViews.values()) {
            view.container.destroy({ children: true });
        }
        this.entityViews.clear();
        this.app?.destroy(true, { children: true });
        this.app = null;
    }

    private drawDebug(world: World): void {
        this.occupancyGraphics.clear();
        this.staticPhysicsGraphics.clear();
        this.navMeshGraphics.clear();
        this.portalGraphics.clear();
        this.pathGraphics.clear();

        if (this.debugOptions.showOccupancy) {
            for (const { footprint } of world.map.occupancy.getAllFootprints()) {
                const topLeft = this.worldToScreen(
                    footprint.cellX * world.map.cellSize,
                    footprint.cellZ * world.map.cellSize,
                    world,
                );
                const width = footprint.width * world.map.cellSize * this.worldScale;
                const height = footprint.height * world.map.cellSize * this.worldScale;
                this.occupancyGraphics.rect(topLeft.x, topLeft.y, width, height).fill({
                    color: "#5f6f84",
                    alpha: 0.12,
                });
                this.occupancyGraphics.rect(topLeft.x, topLeft.y, width, height).stroke({
                    color: "#425163",
                    width: 1.5,
                    alpha: 0.7,
                });
            }
        }

        if (this.debugOptions.showStaticPhysics) {
            for (const rect of world.map.staticPhysics.getDebugMergedRects()) {
                const topLeft = this.worldToScreen(
                    rect.cellX * world.map.cellSize,
                    rect.cellZ * world.map.cellSize,
                    world,
                );
                const width = rect.width * world.map.cellSize * this.worldScale;
                const height = rect.height * world.map.cellSize * this.worldScale;
                this.staticPhysicsGraphics.rect(topLeft.x, topLeft.y, width, height).stroke({
                    color: "#131313",
                    width: 2.5,
                    alpha: 0.75,
                });
            }
        }

        if (this.debugOptions.showNavMesh || this.debugOptions.showPortals) {
            for (const agentSize of this.debugOptions.visibleAgentSizes) {
                const snapshot = world.map.navMesh.getDebugSnapshot(agentSize);
                if (!snapshot) {
                    continue;
                }

                this.drawNavMeshSnapshot(world, agentSize, snapshot);
            }
        }

        if (this.debugOptions.showPaths) {
            for (const entity of world.getEntities()) {
                if (!entity.isValid) {
                    continue;
                }

                const transform = entity.getComponent(Transform);
                const locomotor = entity.getComponent(Locomotor);
                if (!transform || !locomotor || !locomotor.isMoving()) {
                    continue;
                }

                const path = locomotor.getDebugPath(transform);
                if (path.length === 0) {
                    continue;
                }

                const color = this.getEntityColor(entity);
                const start = this.worldToScreen(transform.x, transform.z, world);
                this.pathGraphics.moveTo(start.x, start.y);
                for (const point of path) {
                    const screen = this.worldToScreen(point.x, point.z, world);
                    this.pathGraphics.lineTo(screen.x, screen.y);
                    this.pathGraphics.circle(screen.x, screen.y, 4).fill({ color, alpha: 0.9 });
                    this.pathGraphics.moveTo(screen.x, screen.y);
                }
                this.pathGraphics.stroke({ color, width: 2.5, alpha: 0.9 });
            }
        }
    }

    private drawNavMeshSnapshot(world: World, agentSize: NavAgentSize, snapshot: NavMeshDebugSnapshot): void {
        const palette = AGENT_DEBUG_COLORS[agentSize];

        if (this.debugOptions.showNavMesh) {
            for (const region of snapshot.regions) {
                const topLeft = this.worldToScreen(region.cellX * world.map.cellSize, region.cellZ * world.map.cellSize, world);
                const width = region.width * world.map.cellSize * this.worldScale;
                const height = region.height * world.map.cellSize * this.worldScale;

                this.navMeshGraphics.rect(topLeft.x, topLeft.y, width, height).fill({
                    color: palette.fill,
                    alpha: 0.07,
                });
                this.navMeshGraphics.rect(topLeft.x, topLeft.y, width, height).stroke({
                    color: palette.line,
                    width: 1.2,
                    alpha: 0.65,
                });
            }
        }

        if (this.debugOptions.showPortals) {
            for (const portal of snapshot.portals) {
                const start = this.worldToScreen(portal.start.x, portal.start.z, world);
                const end = this.worldToScreen(portal.end.x, portal.end.z, world);
                const mid = {
                    x: (start.x + end.x) * 0.5,
                    y: (start.y + end.y) * 0.5,
                };

                this.portalGraphics.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({
                    color: palette.portal,
                    width: 3,
                    alpha: 0.8,
                });
                this.portalGraphics.circle(mid.x, mid.y, 2.5).fill({
                    color: palette.portal,
                    alpha: 0.9,
                });
            }
        }
    }

    private getOrCreateView(entity: Entity): EntityView {
        const existing = this.entityViews.get(entity.GUID);
        if (existing) {
            return existing;
        }

        const container = new Container();
        const body = new Graphics();
        const label = new Text({
            text: entity.prefabName,
            style: {
                fill: "#2b2b2b",
                fontSize: 12,
            },
        });
        label.anchor.set(0.5, 1.6);

        container.addChild(body);
        container.addChild(label);

        const view: EntityView = {
            container,
            body,
            label,
        };

        this.drawEntityBody(entity, view.body);
        this.root.addChild(container);
        this.entityViews.set(entity.GUID, view);
        return view;
    }

    private drawEntityBody(entity: Entity, graphics: Graphics): void {
        graphics.clear();

        if (entity.prefabName === "berries") {
            graphics.circle(0, 0, 10).fill("#8b2f6b");
            graphics.circle(-6, -3, 4).fill("#6b1d4f");
            graphics.circle(5, -4, 4).fill("#6b1d4f");
            return;
        }

        const color = this.getEntityColor(entity);
        const radius = entity.hasTag(EntityTag.Player)
            ? 14
            : entity.hasTag(EntityTag.Spider)
                ? 12
                : 10;

        graphics.circle(0, 0, radius).fill(color);
        graphics.moveTo(0, 0).lineTo(radius + 6, 0).stroke({ color: "#1f1f1f", width: 2 });
    }

    private updateHealthBar(entity: Entity, view: EntityView): void {
        const health = entity.getComponent(Health);
        if (!health) {
            if (view.healthBarBg) {
                view.healthBarBg.visible = false;
            }
            if (view.healthBarFill) {
                view.healthBarFill.visible = false;
            }
            return;
        }

        if (!view.healthBarBg || !view.healthBarFill) {
            view.healthBarBg = new Graphics();
            view.healthBarFill = new Graphics();
            view.healthBarBg.position.set(-18, -24);
            view.healthBarFill.position.set(-18, -24);
            view.container.addChild(view.healthBarBg);
            view.container.addChild(view.healthBarFill);
        }

        const progress = health.maxHealth > 0 ? health.currentHealth / health.maxHealth : 0;
        view.healthBarBg.visible = true;
        view.healthBarFill.visible = true;
        view.healthBarBg.clear().roundRect(0, 0, 36, 5, 2).fill("#331818");
        view.healthBarFill.clear().roundRect(0, 0, Math.max(0, 36 * progress), 5, 2).fill("#67b44a");
    }

    private drawGrid(world: World): void {
        const map = world.map;
        const bounds = map.bounds;
        const cellSize = map.cellSize;
        const origin = this.worldToScreen(0, 0, world);
        const left = origin.x + bounds.minX * this.worldScale;
        const right = origin.x + bounds.maxX * this.worldScale;
        const top = origin.y + bounds.minZ * this.worldScale;
        const bottom = origin.y + bounds.maxZ * this.worldScale;

        this.grid.clear();
        this.grid.rect(left, top, right - left, bottom - top).fill("#ede7d6");

        for (let x = bounds.minX; x <= bounds.maxX; x += cellSize) {
            const start = this.worldToScreen(x, bounds.minZ, world);
            const end = this.worldToScreen(x, bounds.maxZ, world);
            this.grid.moveTo(start.x, start.y).lineTo(end.x, end.y);
        }
        for (let z = bounds.minZ; z <= bounds.maxZ; z += cellSize) {
            const start = this.worldToScreen(bounds.minX, z, world);
            const end = this.worldToScreen(bounds.maxX, z, world);
            this.grid.moveTo(start.x, start.y).lineTo(end.x, end.y);
        }
        this.grid.stroke({ color: "#d7cfbb", width: 1 });
    }

    private worldToScreen(x: number, z: number, world: World): { x: number; y: number } {
        const renderer = this.app?.renderer;
        const width = renderer?.width ?? 800;
        const height = renderer?.height ?? 600;
        return {
            x: width * 0.5 + x * this.worldScale,
            y: height * 0.5 + z * this.worldScale,
        };
    }

    private getEntityColor(entity: Entity): ColorSource {
        if (entity.hasTag(EntityTag.Player)) {
            return "#2f7dd1";
        }
        if (entity.hasTag(EntityTag.Spider)) {
            return "#c75d2c";
        }
        if (entity.hasTag(EntityTag.Monster)) {
            return "#9a3f2d";
        }
        if (entity.prefabName.includes("rock")) {
            return "#7a7a7a";
        }
        return "#4f8a52";
    }
}
