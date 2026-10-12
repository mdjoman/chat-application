import { store } from '../state/store';
import type { Conversation, Message } from '../types';

interface NotificationPrefs {
  messageSound: boolean;
  messagePopup: boolean;
  callSound: boolean;
  callPopup: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  messageSound: true,
  messagePopup: true,
  callSound: true,
  callPopup: true,
};

class NotificationService {
  private prefs: NotificationPrefs = { ...DEFAULT_PREFS };
  private audioCtx: AudioContext | null = null;
  private granted = false;

  async init(): Promise<void> {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { /* noop */ });
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) { this.granted = false; return false; }
    if (Notification.permission === 'granted') { this.granted = true; return true; }
    if (Notification.permission === 'denied') { this.granted = false; return false; }
    try {
      const result = await Notification.requestPermission();
      this.granted = result === 'granted';
      return this.granted;
    } catch { this.granted = false; return false; }
  }

  setPrefs(next: Partial<NotificationPrefs>): void {
    this.prefs = { ...this.prefs, ...next };
  }

  shouldNotify(conversation: Conversation | undefined, msg: Message): boolean {
    const me = store.get().me;
    if (!me) return false;
    if (msg.senderId === me.id) return false;
    if (!this.prefs.messagePopup && !this.prefs.messageSound) return false;
    const activeId = store.get().activeConversationId;
    const isActive = conversation?.id === activeId;
    const tabFocused = !document.hidden;
    if (isActive && tabFocused) return false;
    return true;
  }

  notifyMessage(conversation: Conversation | undefined, msg: Message): void {
    if (!this.shouldNotify(conversation, msg)) return;
    if (this.prefs.messageSound) this.playBeep();
    if (this.prefs.messagePopup && this.granted) {
      const title = this.titleFor(conversation, msg);
      const body = msg.content ?? this.fallbackBody(msg);
      this.showPopup(title, body, () => {
        window.focus();
        if (conversation) store.set({ isOpen: true, activeConversationId: conversation.id });
      });
    }
  }

  notifyCall(from: string, isVideo: boolean): void {
    if (this.prefs.callSound) this.playRingtone();
    if (this.prefs.callPopup && this.granted) {
      this.showPopup(`Incoming ${isVideo ? 'video' : 'audio'} call`, `From ${from}`, () => window.focus());
    }
  }

  private titleFor(conversation: Conversation | undefined, msg: Message): string {
    if (!conversation) return 'New message';
    if (conversation.type === 'group') return conversation.name ?? 'Group';
    const other = conversation.members.find((m) => m.userId === msg.senderId);
    return other ? `User #${other.userId}` : 'New message';
  }

  private fallbackBody(msg: Message): string {
    switch (msg.type) {
      case 'image': return '📷 Photo';
      case 'video': return '🎥 Video';
      case 'audio': return '🎵 Audio';
      case 'file': return '📄 File';
      case 'voice': return '🎤 Voice message';
      default: return 'New message';
    }
  }

  private showPopup(title: string, body: string, onClick: () => void): void {
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'chat-widget-' + Date.now(), silent: true });
      n.onclick = () => { onClick(); n.close(); };
    } catch { /* noop */ }
  }

  private ensureAudioCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = W.AudioContext || W.webkitAudioContext;
    if (!Ctor) return null;
    if (!this.audioCtx) this.audioCtx = new Ctor();
    return this.audioCtx;
  }

  private playBeep(): void {
    const ctx = this.ensureAudioCtx();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch { /* noop */ }
  }

  private playRingtone(): void {
    const ctx = this.ensureAudioCtx();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const t0 = now + i * 0.6;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, t0);
        osc.frequency.setValueAtTime(880, t0 + 0.15);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.4);
      }
    } catch { /* noop */ }
  }
}

export const notifications = new NotificationService();
