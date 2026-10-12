export function buildStyles(primaryColor: string): string {
  const PRIMARY = primaryColor || '#EC4899';
  return `
:host {
  all: initial;
  --cw-primary: ${PRIMARY};
  --cw-purple: #6D28D9;
  --cw-deep-purple: #4C1D95;
  --cw-secondary: #8B5CF6;

  --cw-bg: #FFFFFF;
  --cw-bg-2: #F7F7F9;
  --cw-bg-3: #EFEFF3;
  --cw-text: #111827;
  --cw-text-muted: #6B7280;
  --cw-border: #E5E7EB;

  --cw-bubble-me: ${PRIMARY};
  --cw-bubble-me-text: #FFFFFF;
  --cw-bubble-them: #F3F4F6;
  --cw-bubble-them-text: #111827;

  --cw-radius: 16px;
  --cw-radius-sm: 12px;
  --cw-shadow: 0 12px 32px rgba(17, 24, 39, .18);
  --cw-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --cw-font-size: 14px;
}
:host([data-theme="dark"]) {
  --cw-bg: #000000;
  --cw-bg-2: #0F0F12;
  --cw-bg-3: #1B1B22;
  --cw-text: #FFFFFF;
  --cw-text-muted: #9CA3AF;
  --cw-border: #2A2A33;
  --cw-bubble-them: #1B1B22;
  --cw-bubble-them-text: #FFFFFF;
  --cw-shadow: 0 12px 32px rgba(0, 0, 0, .65);
}

* { box-sizing: border-box; }
button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
input, textarea { font: inherit; color: inherit; }
a { color: inherit; }

.cw-root {
  position: fixed; z-index: 2147483000;
  font-family: var(--cw-font); font-size: var(--cw-font-size);
  color: var(--cw-text);
}
.cw-root[data-position="bottom-right"] { right: 20px; bottom: 20px; }
.cw-root[data-position="bottom-left"]  { left: 20px; bottom: 20px; }

/* Launcher */
.cw-launcher {
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, var(--cw-primary), var(--cw-purple));
  color: white; box-shadow: var(--cw-shadow);
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease;
}
.cw-launcher:hover { transform: scale(1.05); }
.cw-launcher__badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 10px; background: #EF4444; color: white;
  font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}

/* Panel */
.cw-panel {
  width: 380px; height: 620px; max-height: calc(100vh - 40px);
  background: var(--cw-bg);
  border-radius: var(--cw-radius);
  box-shadow: var(--cw-shadow);
  overflow: hidden;
  display: flex; flex-direction: column;
  border: 1px solid var(--cw-border);
}
@media (max-width: 480px) {
  .cw-panel { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
  .cw-root[data-position] { right: 0; left: 0; bottom: 0; }
}

/* Header */
.cw-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  background: linear-gradient(135deg, var(--cw-primary), var(--cw-purple));
  color: white;
}
.cw-header__title { font-weight: 700; font-size: 15px; letter-spacing: .2px; }
.cw-header__sub   { font-size: 11px; opacity: .9; margin-top: 1px; }
.cw-header__actions { display: flex; gap: 6px; }
.cw-icon-btn {
  width: 34px; height: 34px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: inherit; opacity: .95;
}
.cw-icon-btn:hover { background: rgba(255,255,255,.18); opacity: 1; }
.cw-icon-btn--ghost { color: var(--cw-text-muted); }
.cw-icon-btn--ghost:hover { background: var(--cw-bg-3); color: var(--cw-text); }
.cw-icon-btn--primary {
  background: var(--cw-primary); color: white;
}
.cw-icon-btn--primary:hover { background: var(--cw-purple); }

/* Conversation list */
.cw-list { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.cw-list__toolbar {
  display: flex; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid var(--cw-border);
  align-items: center;
  background: var(--cw-bg);
}
.cw-searchbox {
  flex: 1; display: flex; align-items: center; gap: 6px;
  background: var(--cw-bg-2);
  padding: 8px 12px; border-radius: 12px;
  color: var(--cw-text-muted);
}
.cw-searchbox input {
  border: none; background: transparent; outline: none;
  flex: 1; font-size: 13px; color: var(--cw-text);
}

.cw-conv {
  display: flex; gap: 12px; align-items: center;
  padding: 12px 14px; cursor: pointer;
  border-bottom: 1px solid var(--cw-border);
  transition: background .12s ease;
}
.cw-conv:hover { background: var(--cw-bg-2); }
.cw-conv[data-active="true"] { background: var(--cw-bg-3); }

.cw-avatar {
  width: 42px; height: 42px; border-radius: 50%;
  background: linear-gradient(135deg, var(--cw-secondary), var(--cw-purple));
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: #FFFFFF;
  flex-shrink: 0; font-size: 14px;
}
.cw-avatar--lg { width: 56px; height: 56px; font-size: 18px; }
.cw-avatar--xl { width: 120px; height: 120px; font-size: 40px; }

.cw-conv__body { flex: 1; min-width: 0; }
.cw-conv__title {
  font-weight: 600; font-size: 14px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cw-conv__preview {
  color: var(--cw-text-muted); font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 2px;
}
.cw-conv__unread {
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 10px; background: var(--cw-primary); color: white;
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

/* Chat */
.cw-chat { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.cw-chat__header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg);
}
.cw-chat__body {
  flex: 1; overflow-y: auto; padding: 14px 12px;
  background: var(--cw-bg-2);
  display: flex; flex-direction: column; gap: 6px;
  scroll-behavior: smooth;
}
.cw-chat__footer {
  border-top: 1px solid var(--cw-border);
  padding: 10px;
  background: var(--cw-bg);
}

/* Messages */
.cw-msg {
  max-width: 82%;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  word-wrap: break-word; white-space: pre-wrap;
  position: relative; line-height: 1.4;
  font-size: 14px;
}
.cw-msg--me   { align-self: flex-end;   background: var(--cw-bubble-me);   color: var(--cw-bubble-me-text);   border-bottom-right-radius: 4px; }
.cw-msg--them { align-self: flex-start; background: var(--cw-bubble-them); color: var(--cw-bubble-them-text); border-bottom-left-radius: 4px; }
.cw-msg--deleted { font-style: italic; opacity: .7; }
.cw-msg__meta { font-size: 10.5px; opacity: .75; margin-top: 4px; text-align: right; }
.cw-msg__reply {
  border-left: 3px solid rgba(255,255,255,.7);
  padding: 4px 8px; margin-bottom: 4px;
  font-size: 12px; opacity: .95;
  background: rgba(0,0,0,.08); border-radius: 6px;
}
.cw-msg__text { word-break: break-word; }
.cw-msg__reactions { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.cw-reaction {
  background: var(--cw-bg); color: var(--cw-text);
  border: 1px solid var(--cw-border);
  border-radius: 12px;
  padding: 2px 8px; font-size: 12px;
  display: flex; align-items: center; gap: 4px;
}
.cw-reaction[data-mine="true"] {
  border-color: var(--cw-primary);
  background: rgba(236,72,153,.15);
}
.cw-msg__actions {
  position: absolute; top: -10px; right: 8px;
  background: var(--cw-bg); color: var(--cw-text);
  border: 1px solid var(--cw-border);
  border-radius: 10px; padding: 2px;
  display: none; gap: 2px;
  box-shadow: 0 4px 12px rgba(0,0,0,.08);
  z-index: 3;
}
.cw-msg:hover .cw-msg__actions { display: flex; }
.cw-msg__actions button { padding: 4px 6px; border-radius: 6px; font-size: 12px; }
.cw-msg__actions button:hover { background: var(--cw-bg-3); }

/* Input */
.cw-input { display: flex; flex-direction: column; gap: 6px; }
.cw-input__row { display: flex; gap: 6px; align-items: flex-end; }
.cw-input textarea {
  flex: 1; resize: none;
  border: 1px solid var(--cw-border);
  border-radius: 22px; padding: 10px 14px;
  outline: none; background: var(--cw-bg-2);
  max-height: 100px; min-height: 42px;
  line-height: 1.35;
}
.cw-input textarea:focus { border-color: var(--cw-primary); }
.cw-send {
  width: 42px; height: 42px; border-radius: 50%;
  background: var(--cw-primary); color: white;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: transform .12s ease;
}
.cw-send:hover { transform: scale(1.05); }
.cw-send[disabled] { opacity: .5; cursor: not-allowed; }
.cw-send--danger { background: #EF4444; }

.cw-replybar {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--cw-bg-2); padding: 6px 10px; border-radius: 10px;
  font-size: 12px;
}
.cw-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.cw-chip {
  background: var(--cw-bg-2); padding: 4px 8px; border-radius: 12px;
  font-size: 12px; display: inline-flex; gap: 6px; align-items: center;
}

.cw-recording {
  flex: 1;
  display: flex; align-items: center; gap: 8px;
  background: var(--cw-bg-2); padding: 10px 14px;
  border-radius: 22px; font-size: 13px;
}
.cw-recording__dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #EF4444;
  animation: cw-pulse 1s ease-in-out infinite;
}
@keyframes cw-pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

.cw-typing {
  font-size: 12px; color: var(--cw-text-muted);
  padding: 4px 14px; height: 22px;
}

/* Attachments */
.cw-attach { margin: 4px 0; }
.cw-attach img, .cw-attach video {
  max-width: 100%; max-height: 320px; border-radius: 10px; display: block;
}
.cw-attach audio { width: 100%; }
.cw-attach--file {
  display: flex; align-items: center; gap: 8px;
  background: rgba(0,0,0,.08);
  padding: 8px 10px; border-radius: 10px;
  color: inherit; text-decoration: none;
  font-size: 13px;
}
.cw-attach__name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cw-attach__size { opacity: .7; font-size: 11px; }

/* Empty / spinner */
.cw-empty {
  padding: 40px 20px; text-align: center; color: var(--cw-text-muted);
}
.cw-spinner {
  width: 24px; height: 24px;
  border: 3px solid var(--cw-border);
  border-top-color: var(--cw-primary);
  border-radius: 50%;
  animation: cw-spin 0.8s linear infinite;
  margin: 0 auto;
}
@keyframes cw-spin { to { transform: rotate(360deg); } }

/* Emoji */
.cw-emoji { display: flex; gap: 4px; padding: 6px 0; flex-wrap: wrap; }
.cw-emoji button { padding: 4px 6px; border-radius: 8px; font-size: 18px; }
.cw-emoji button:hover { background: var(--cw-bg-3); }

/* Auth forms */
.cw-login {
  display: flex; flex-direction: column; gap: 12px;
  padding: 22px;
  flex: 1; overflow-y: auto;
}
.cw-login__tabs {
  display: flex; gap: 0;
  background: var(--cw-bg-2);
  border-radius: 12px; padding: 3px;
}
.cw-login__tab {
  flex: 1; padding: 8px 12px; border-radius: 10px;
  font-size: 13px; font-weight: 600; color: var(--cw-text-muted);
  text-align: center;
}
.cw-login__tab--active {
  background: var(--cw-bg); color: var(--cw-text);
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
.cw-login__title { font-size: 20px; font-weight: 800; margin-top: 6px; }
.cw-login__sub   { font-size: 12px; color: var(--cw-text-muted); margin-bottom: 4px; }
.cw-login__form  { display: flex; flex-direction: column; gap: 12px; }
.cw-login__error {
  background: #FEE2E2; color: #991B1B;
  padding: 8px 10px; border-radius: 10px; font-size: 12px;
}
.cw-login__info {
  background: #DBEAFE; color: #1E3A8A;
  padding: 8px 10px; border-radius: 10px; font-size: 12px;
}
:host([data-theme="dark"]) .cw-login__error { background: #7F1D1D; color: #FECACA; }
:host([data-theme="dark"]) .cw-login__info  { background: #1E3A8A; color: #DBEAFE; }

.cw-field { display: flex; flex-direction: column; gap: 4px; }
.cw-field__label { font-size: 12px; color: var(--cw-text-muted); }
.cw-field__input {
  border: 1px solid var(--cw-border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--cw-bg-2);
  outline: none;
}
.cw-field__input:focus { border-color: var(--cw-primary); }
.cw-login__submit {
  margin-top: 4px;
  background: var(--cw-primary); color: white;
  padding: 11px 14px; border-radius: 12px; font-weight: 700;
}
.cw-login__submit[disabled] { opacity: .6; cursor: not-allowed; }
.cw-login__link {
  text-align: center; font-size: 12px;
  color: var(--cw-primary); text-decoration: underline;
  padding: 4px;
}
.cw-login__hint {
  margin-top: 8px; font-size: 11px; color: var(--cw-text-muted);
  text-align: center;
}
.cw-login__hint code { background: var(--cw-bg-2); padding: 1px 5px; border-radius: 4px; }

/* Error bar */
.cw-errorbar {
  background: #FEE2E2; color: #991B1B;
  padding: 8px 12px; font-size: 12px; cursor: pointer;
}
:host([data-theme="dark"]) .cw-errorbar { background: #7F1D1D; color: #FECACA; }

/* Call overlay */
.cw-call {
  position: fixed; inset: 0; z-index: 2147483600;
  background: #0B0B0B; color: white;
  display: flex; flex-direction: column;
}
.cw-call__stage { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.cw-call__remote { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cw-call__local {
  position: absolute; right: 16px; bottom: 16px;
  width: 120px; height: 160px; border-radius: 14px;
  object-fit: cover; background: black;
  box-shadow: 0 6px 24px rgba(0,0,0,.4);
}
.cw-call__avatar { display: flex; align-items: center; justify-content: center; }
.cw-call__meta { position: absolute; top: 20px; left: 16px; right: 16px; text-align: center; }
.cw-call__name { font-size: 18px; font-weight: 700; }
.cw-call__status { font-size: 13px; opacity: .85; margin-top: 2px; }
.cw-call__controls {
  display: flex; justify-content: center; gap: 12px;
  padding: 20px; background: rgba(0,0,0,.65);
}
.cw-ctrl {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(255,255,255,.15); color: white;
  display: flex; align-items: center; justify-content: center;
}
.cw-ctrl:hover { background: rgba(255,255,255,.25); }
.cw-ctrl--active { background: rgba(255,255,255,.35); }
.cw-ctrl--danger { background: #EF4444; }
.cw-ctrl--danger:hover { background: #DC2626; }

/* ---------- Message rows with avatars ---------- */
.cw-msgRow {
  display: flex; align-items: flex-end; gap: 8px; margin-bottom: 6px;
}
.cw-msgRow--me   { justify-content: flex-end; }
.cw-msgRow--them { justify-content: flex-start; }

.cw-msgRow__avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(135deg, var(--cw-secondary), var(--cw-purple));
  color: white; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; overflow: hidden;
}
.cw-msgRow__avatar img { width: 100%; height: 100%; object-fit: cover; }

.cw-msg__sender {
  font-size: 11px; font-weight: 600; opacity: .85;
  margin-bottom: 2px;
}

.cw-msg__pinned, .cw-msg__forwarded {
  font-size: 11px; opacity: .8; margin-bottom: 3px;
  display: flex; align-items: center; gap: 4px;
}

/* ---------- 3-dot menu trigger ---------- */
.cw-msg__more {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0,0,0,.06); color: inherit;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; line-height: 1; opacity: .65;
  transition: opacity .12s ease;
}
.cw-msg__more:hover { opacity: 1; background: rgba(0,0,0,.14); }
.cw-msg--me .cw-msg__more { background: rgba(255,255,255,.22); color: white; }
.cw-msg--me .cw-msg__more:hover { background: rgba(255,255,255,.35); }

/* ---------- Message context menu ---------- */
.cw-menu {
  position: absolute;
  z-index: 40;
  top: 24px; right: 4px;
  background: var(--cw-bg);
  color: var(--cw-text);
  border: 1px solid var(--cw-border);
  border-radius: 12px;
  min-width: 190px;
  padding: 6px;
  box-shadow: 0 12px 32px rgba(0,0,0,.18);
  display: flex; flex-direction: column; gap: 2px;
}
.cw-menu__item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 8px;
  font-size: 13px; text-align: left; color: inherit;
}
.cw-menu__item:hover { background: var(--cw-bg-2); }
.cw-menu__item--danger { color: #DC2626; }
.cw-menu__item--danger:hover { background: #FEE2E2; }
.cw-menu__reactions { padding: 2px; }
.cw-menu__reactionRow { display: flex; gap: 2px; flex-wrap: wrap; padding: 4px; }
.cw-menu__reactionBtn {
  font-size: 18px; padding: 4px 6px; border-radius: 8px;
}
.cw-menu__reactionBtn:hover { background: var(--cw-bg-3); }

/* ---------- Lightbox ---------- */
.cw-lightbox {
  position: fixed; inset: 0; z-index: 2147483600;
  background: rgba(0,0,0,.92);
  display: flex; align-items: center; justify-content: center;
}
.cw-lightbox__content { max-width: 92vw; max-height: 88vh; }
.cw-lightbox__content img, .cw-lightbox__content video {
  max-width: 92vw; max-height: 88vh; border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0,0,0,.6);
}
.cw-lightbox__close {
  position: absolute; top: 16px; right: 16px;
  width: 44px; height: 44px; border-radius: 50%;
  background: rgba(255,255,255,.15); color: white;
  display: flex; align-items: center; justify-content: center;
}
.cw-lightbox__close:hover { background: rgba(255,255,255,.28); }
.cw-lightbox__caption {
  position: absolute; bottom: 20px; left: 0; right: 0;
  text-align: center; color: rgba(255,255,255,.85); font-size: 12px;
}

/* ---------- Attachments ---------- */
.cw-attach__open {
  padding: 0; border: none; background: none; display: block;
  position: relative; max-width: 100%;
}
.cw-attach__play {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 32px;
  background: rgba(0,0,0,.35); border-radius: 10px;
  opacity: .9;
}

/* ---------- Chat header title button ---------- */
.cw-chat__titleBtn {
  flex: 1; display: flex; flex-direction: column;
  align-items: flex-start; text-align: left;
  background: none; padding: 0; color: inherit;
  min-width: 0;
}
.cw-chat__title {
  font-weight: 700; font-size: 14px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%;
}
.cw-chat__subtitle {
  font-size: 11px; color: var(--cw-text-muted);
}

/* ---------- Conversation list tweaks ---------- */
.cw-conv__row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 6px;
}
.cw-conv__time {
  font-size: 10.5px; color: var(--cw-text-muted);
  flex-shrink: 0;
}
.cw-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

/* ---------- Profile avatar button ---------- */
.cw-avatar--button {
  position: relative;
  padding: 0; border: none; cursor: pointer;
  overflow: visible;
}
.cw-avatar__edit {
  position: absolute; right: -4px; bottom: -4px;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--cw-primary); color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; border: 2px solid var(--cw-bg);
}
`;
}
