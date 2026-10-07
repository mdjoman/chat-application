import type { WidgetEvent } from '../types';

type Handler = (payload?: unknown) => void;

class EventBus {
  private handlers = new Map<WidgetEvent, Set<Handler>>();

  on(event: WidgetEvent, handler: Handler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  off(event: WidgetEvent, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: WidgetEvent, payload?: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[ChatWidget] event handler for "${event}" threw`, err);
      }
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
