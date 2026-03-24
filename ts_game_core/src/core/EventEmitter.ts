/**
 * Event handler function type
 */
export type EventHandler = (data?: any) => void;

/**
 * A lightweight event emitter inspired by game engine events
 */
export class EventEmitter {
    private listeners: Map<string, EventHandler[]> = new Map();

    /**
     * Add an event listener
     */
    public on(event: string, handler: EventHandler): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(handler);
    }

    /**
     * Remove an event listener
     */
    public off(event: string, handler: EventHandler): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                // To avoid index shifting during emit, it's safer to copy or just splice if we copy in emit
                handlers.splice(index, 1);
            }
            if (handlers.length === 0) {
                this.listeners.delete(event);
            }
        }
    }

    /**
     * Emit an event, optionally with data
     */
    public emit(event: string, data?: any): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            // Copy handlers array to prevent mutation issues during emission
            // (e.g. if a handler calls off() on itself)
            const handlersCopy = [...handlers];
            for (const handler of handlersCopy) {
                handler(data);
            }
        }
    }

    /**
     * Remove all event listeners
     */
    public removeAllListeners(): void {
        this.listeners.clear();
    }
}
