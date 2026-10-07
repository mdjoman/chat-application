import { ChatWidget } from './bootstrap';
import type { ChatWidgetConfig } from './types';

// ---- Expose on window ------------------------------------------------
// We deliberately do NOT use `export` here. tsup/esbuild with `globalName`
// would otherwise wrap our export in an extra object: `window.ChatWidget.ChatWidget`.
//
// By only doing `window.ChatWidget = ChatWidget` (side effect) and providing no
// exports, the IIFE runs and `window.ChatWidget` becomes the object itself.
declare global {
  interface Window {
    ChatWidget: typeof ChatWidget;
    ChatWidgetConfig?: ChatWidgetConfig;
  }
}

if (typeof window !== 'undefined') {
  window.ChatWidget = ChatWidget;

  // Auto-init if a global config was set BEFORE the script loaded
  if (window.ChatWidgetConfig) {
    setTimeout(() => {
      ChatWidget.init(window.ChatWidgetConfig!).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[ChatWidget] auto-init failed', err);
      });
    }, 0);
  }
}

// Intentionally no `export` — keeps the IIFE global a plain object.
export {};
