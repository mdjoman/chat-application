import { render } from 'preact';
import { App } from './App';
import { buildStyles } from '../styles/styles.css';
import { store } from '../state/store';
import type { ApiClient } from '../services/api-client';
import type { SocketClient } from '../services/socket-client';

export function mountWidget(opts: {
  api: ApiClient;
  socket: SocketClient;
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark' | 'auto';
  tenantSlug: string;
  initialResetToken?: string;
  onAuthed: () => Promise<void>;
  onLogout: () => void;
}): { host: HTMLElement; shadow: ShadowRoot } {
  const existing = document.getElementById('chat-widget-root');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'chat-widget-root';
  const shadow = host.attachShadow({ mode: 'open' });

  const resolvedTheme =
    opts.theme === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : opts.theme;
  host.setAttribute('data-theme', resolvedTheme);
  store.set({ theme: resolvedTheme });

  if (opts.theme === 'auto') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      const next = mq.matches ? 'dark' : 'light';
      host.setAttribute('data-theme', next);
      store.set({ theme: next });
    });
  }

  const style = document.createElement('style');
  style.textContent = buildStyles(opts.primaryColor);
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'cw-root';
  container.setAttribute('data-position', opts.position);
  shadow.appendChild(container);

  render(
    <App
      api={opts.api}
      socket={opts.socket}
      tenantSlug={opts.tenantSlug}
      onAuthed={opts.onAuthed}
      onLogout={opts.onLogout}
      initialResetToken={opts.initialResetToken}
    />,
    container,
  );

  document.body.appendChild(host);
  return { host, shadow };
}
