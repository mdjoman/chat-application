import { useEffect, useRef, useState } from 'preact/hooks';
import { IconSend } from './Icons';
import type { Message } from '../types';

export function MessageInput(props: {
  disabled: boolean;
  replyTo: Message | null;
  onCancelReply: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);

  useEffect(() => {
    if (props.replyTo) taRef.current?.focus();
  }, [props.replyTo]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }

  function emitTypingStop() {
    if (typingActive.current) {
      typingActive.current = false;
      props.onTypingStop();
    }
  }

  function handleInput(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    setText(el.value);
    autoResize(el);

    if (!typingActive.current) {
      typingActive.current = true;
      props.onTypingStart();
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      emitTypingStop();
    }, 2500);
  }

  function submit() {
    const value = text.trim();
    if (!value) return;
    props.onSend(value);
    setText('');
    if (taRef.current) {
      taRef.current.style.height = 'auto';
    }
    emitTypingStop();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = text.trim().length > 0 && !props.disabled;

  return (
    <div class="cw-input" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {props.replyTo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--cw-bg-2)',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <span>Replying to #{props.replyTo.id}</span>
          <button type="button" onClick={props.onCancelReply} aria-label="Cancel reply">
            ×
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={taRef}
          placeholder="Type a message…"
          value={text}
          disabled={props.disabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          type="button"
          class="cw-send"
          disabled={!canSend}
          onClick={submit}
          aria-label="Send message"
        >
          <IconSend width={18} height={18} />
        </button>
      </div>
    </div>
  );
}
