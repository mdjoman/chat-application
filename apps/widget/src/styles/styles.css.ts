export function buildStyles(primaryColor: string): string {
  return `
:host {
  all: initial;
  --cw-primary: ${primaryColor};
  --cw-primary-hover: ${primaryColor};
  --cw-bg: #ffffff;
  --cw-bg-2: #f6f7f9;
  --cw-bg-3: #eef0f3;
  --cw-text: #111827;
  --cw-text-muted: #6b7280;
  --cw-border: #e5e7eb;
  --cw-bubble-me: var(--cw-primary);
  --cw-bubble-me-text: #ffffff;
  --cw-bubble-them: #f3f4f6;
  --cw-bubble-them-text: #111827;
  --cw-radius: 14px;
  --cw-radius-sm: 10px;
  --cw-shadow: 0 10px 30px rgba(0,0,0,0.15);
  --cw-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --cw-font-size: 14px;
}

:host([data-theme="dark"]) {
  --cw-bg: #111827;
  --cw-bg-2: #1f2937;
  --cw-bg-3: #374151;
  --cw-text: #f9fafb;
  --cw-text-muted: #9ca3af;
  --cw-border: #374151;
  --cw-bubble-them: #1f2937;
  --cw-bubble-them-text: #f9fafb;
  --cw-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

* { box-sizing: border-box; }
button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
input, textarea { font: inherit; color: inherit; }

.cw-root {
  position: fixed;
  z-index: 2147483000;
  font-family: var(--cw-font);
  font-size: var(--cw-font-size);
  color: var(--cw-text);
}
.cw-root[data-position="bottom-right"] { right: 20px; bottom: 20px; }
.cw-root[data-position="bottom-left"]  { left:  20px; bottom: 20px; }

.cw-launcher {
  width: 60px; height: 60px;
  border-radius: 50%;
  background: var(--cw-primary);
  color: white;
  box-shadow: var(--cw-shadow);
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease;
}
.cw-launcher:hover { transform: scale(1.05); }
.cw-launcher__badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 10px;
  background: #ef4444; color: white;
  font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}

.cw-panel {
  width: 380px;
  height: 620px;
  max-height: calc(100vh - 40px);
  background: var(--cw-bg);
  border-radius: var(--cw-radius);
  box-shadow: var(--cw-shadow);
  overflow: hidden;
  display: flex; flex-direction: column;
  border: 1px solid var(--cw-border);
}
@media (max-width: 480px) {
  .cw-panel {
    width: 100vw; height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  .cw-root[data-position] { right: 0; left: 0; bottom: 0; }
}

.cw-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  background: var(--cw-primary);
  color: white;
}
.cw-header__title { font-weight: 600; font-size: 15px; }
.cw-header__sub   { font-size: 11px; opacity: .85; margin-top: 1px; }
.cw-header__actions { display: flex; gap: 6px; }
.cw-icon-btn {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: inherit;
  opacity: .9;
}
.cw-icon-btn:hover { background: rgba(255,255,255,.15); opacity: 1; }

.cw-list { flex: 1; overflow-y: auto; }
.cw-conv {
  display: flex; gap: 10px; align-items: center;
  padding: 12px 14px; cursor: pointer;
  border-bottom: 1px solid var(--cw-border);
}
.cw-conv:hover { background: var(--cw-bg-2); }
.cw-conv[data-active="true"] { background: var(--cw-bg-3); }
.cw-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--cw-bg-3);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; color: var(--cw-text-muted);
  flex-shrink: 0;
}
.cw-conv__body { flex: 1; min-width: 0; }
.cw-conv__title {
  font-weight: 600; font-size: 14px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cw-conv__preview {
  color: var(--cw-text-muted); font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.cw-chat { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cw-chat__header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-bottom: 1px solid var(--cw-border);
}
.cw-chat__body {
  flex: 1; overflow-y: auto; padding: 12px;
  background: var(--cw-bg-2);
  display: flex; flex-direction: column; gap: 6px;
}
.cw-chat__footer {
  border-top: 1px solid var(--cw-border);
  padding: 8px 10px;
  background: var(--cw-bg);
}

.cw-msg {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  word-wrap: break-word;
  white-space: pre-wrap;
  position: relative;
  line-height: 1.35;
}
.cw-msg--me   { align-self: flex-end;   background: var(--cw-bubble-me);   color: var(--cw-bubble-me-text);   border-bottom-right-radius: 3px; }
.cw-msg--them { align-self: flex-start; background: var(--cw-bubble-them); color: var(--cw-bubble-them-text); border-bottom-left-radius: 3px; }
.cw-msg--deleted { font-style: italic; opacity: .65; }
.cw-msg__meta {
  font-size: 10.5px; opacity: .75; margin-top: 4px; text-align: right;
}
.cw-msg__reply {
  border-left: 3px solid rgba(255,255,255,.6);
  padding: 4px 8px; margin-bottom: 4px;
  font-size: 12px; opacity: .9;
  background: rgba(0,0,0,.08); border-radius: 4px;
}
.cw-msg__reactions {
  display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;
}
.cw-reaction {
  background: var(--cw-bg);
  color: var(--cw-text);
  border: 1px solid var(--cw-border);
  border-radius: 12px;
  padding: 2px 8px; font-size: 12px;
  display: flex; align-items: center; gap: 4px;
}
.cw-reaction[data-mine="true"] {
  border-color: var(--cw-primary);
  background: rgba(99,102,241,.15);
}
.cw-msg__actions {
  position: absolute;
  top: -8px; right: 8px;
  background: var(--cw-bg); color: var(--cw-text);
  border: 1px solid var(--cw-border);
  border-radius: 8px;
  padding: 2px;
  display: none;
  gap: 2px;
}
.cw-msg:hover .cw-msg__actions { display: flex; }
.cw-msg__actions button {
  padding: 4px 6px; border-radius: 6px; font-size: 12px;
}
.cw-msg__actions button:hover { background: var(--cw-bg-3); }

.cw-input {
  display: flex; gap: 8px; align-items: flex-end;
}
.cw-input textarea {
  flex: 1; resize: none;
  border: 1px solid var(--cw-border);
  border-radius: 10px; padding: 8px 10px;
  outline: none;
  background: var(--cw-bg-2);
  max-height: 100px; min-height: 38px;
  line-height: 1.35;
}
.cw-input textarea:focus { border-color: var(--cw-primary); }
.cw-send {
  width: 38px; height: 38px; border-radius: 10px;
  background: var(--cw-primary); color: white;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cw-send[disabled] { opacity: .5; cursor: not-allowed; }

.cw-typing {
  font-size: 12px; color: var(--cw-text-muted);
  padding: 4px 8px;
  height: 20px;
}

.cw-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--cw-text-muted);
}
.cw-spinner {
  width: 22px; height: 22px;
  border: 3px solid var(--cw-border);
  border-top-color: var(--cw-primary);
  border-radius: 50%;
  animation: cw-spin 0.8s linear infinite;
  margin: 0 auto;
}
@keyframes cw-spin { to { transform: rotate(360deg); } }

.cw-emoji {
  display: flex; gap: 4px; padding: 6px 0;
  flex-wrap: wrap;
}
.cw-emoji button {
  padding: 4px 6px; border-radius: 8px; font-size: 18px;
}
.cw-emoji button:hover { background: var(--cw-bg-3); }

/* ---------- Login ---------- */
.cw-login {
  display: flex; flex-direction: column; gap: 12px;
  padding: 24px 22px;
  flex: 1;
  overflow-y: auto;
}
.cw-login__title {
  font-size: 18px; font-weight: 700;
  margin-bottom: 2px;
}
.cw-login__sub {
  font-size: 12px; color: var(--cw-text-muted);
  margin-bottom: 6px;
}
.cw-login__error {
  background: #fee2e2; color: #991b1b;
  padding: 8px 10px; border-radius: 8px;
  font-size: 12px;
}
:host([data-theme="dark"]) .cw-login__error {
  background: #7f1d1d; color: #fecaca;
}
.cw-field {
  display: flex; flex-direction: column; gap: 4px;
}
.cw-field__label {
  font-size: 12px; color: var(--cw-text-muted);
}
.cw-field__input {
  border: 1px solid var(--cw-border);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--cw-bg-2);
  outline: none;
}
.cw-field__input:focus { border-color: var(--cw-primary); }
.cw-login__submit {
  margin-top: 4px;
  background: var(--cw-primary); color: white;
  padding: 10px 14px;
  border-radius: 10px;
  font-weight: 600;
}
.cw-login__submit[disabled] { opacity: .6; cursor: not-allowed; }
.cw-login__hint {
  margin-top: 8px;
  font-size: 11px; color: var(--cw-text-muted);
  text-align: center;
}
.cw-login__hint code {
  background: var(--cw-bg-2);
  padding: 1px 5px; border-radius: 4px;
}
`;
}
