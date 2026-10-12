import { useEffect, useRef, useState } from 'preact/hooks';
import { IconSend, IconAttach, IconMic, IconStop } from './Icons';
import type { Message } from '../types';
import { VoiceRecorder, type Recording } from '../services/voice-recorder';
import type { ApiClient } from '../services/api-client';

export function MessageInput(props: {
  disabled: boolean;
  replyTo: Message | null;
  api: ApiClient;
  onCancelReply: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onSend: (text: string, attachmentIds: number[], type?: Message['type']) => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState('');
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedMs, setRecordedMs] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<VoiceRecorder>(new VoiceRecorder());
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);
  const recTimer = useRef<number | null>(null);

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
    typingTimer.current = window.setTimeout(() => emitTypingStop(), 2500);
  }

  function submitText() {
    const value = text.trim();
    if (!value && pendingIds.length === 0) return;
    props.onSend(value, pendingIds);
    setText('');
    setPendingIds([]);
    if (taRef.current) taRef.current.style.height = 'auto';
    emitTypingStop();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitText();
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        try {
          const dto = await props.api.uploadAttachment(file);
          setPendingIds((ids) => [...ids, dto.id]);
        } catch (err) {
          props.onError(err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function startRecording() {
    try {
      await recorderRef.current.start();
      setRecording(true);
      setRecordedMs(0);
      const start = performance.now();
      recTimer.current = window.setInterval(() => {
        setRecordedMs(Math.round(performance.now() - start));
      }, 200);
    } catch {
      props.onError('Microphone permission denied');
    }
  }

  async function stopAndSend() {
    if (recTimer.current) { window.clearInterval(recTimer.current); recTimer.current = null; }
    setRecording(false);
    try {
      const rec: Recording = await recorderRef.current.stop();
      const file = new File([rec.blob], `voice-${Date.now()}.webm`, { type: rec.mimeType });
      const dto = await props.api.uploadAttachment(file);
      props.onSend('', [dto.id], 'voice');
    } catch {
      props.onError('Voice send failed');
    }
  }

  function cancelRecording() {
    if (recTimer.current) { window.clearInterval(recTimer.current); recTimer.current = null; }
    recorderRef.current.cancel();
    setRecording(false);
    setRecordedMs(0);
  }

  const canSend = (text.trim().length > 0 || pendingIds.length > 0) && !props.disabled;

  return (
    <div class="cw-input">
      {props.replyTo && (
        <div class="cw-replybar">
          <span>Replying to #{props.replyTo.id}</span>
          <button type="button" onClick={props.onCancelReply} aria-label="Cancel reply">×</button>
        </div>
      )}

      {pendingIds.length > 0 && (
        <div class="cw-chips">
          {pendingIds.map((id) => (
            <span key={id} class="cw-chip">
              📎 #{id}
              <button type="button" onClick={() => setPendingIds((ids) => ids.filter((x) => x !== id))} aria-label="Remove">×</button>
            </span>
          ))}
        </div>
      )}

      <div class="cw-input__row">
        {!recording && (
          <>
            <button
              type="button"
              class="cw-icon-btn cw-icon-btn--ghost"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach file"
              title="Attach file"
              disabled={uploading}
            >
              <IconAttach />
            </button>
            <input ref={fileRef} type="file" hidden multiple onChange={(e) => handleFiles((e.target as HTMLInputElement).files)} />
          </>
        )}

        {recording ? (
          <div class="cw-recording">
            <span class="cw-recording__dot" />
            <span>{formatMs(recordedMs)}</span>
            <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={cancelRecording} aria-label="Cancel">×</button>
          </div>
        ) : (
          <textarea
            ref={taRef}
            placeholder="Type a message…"
            value={text}
            disabled={props.disabled || uploading}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        )}

        {!recording && canSend && (
          <button type="button" class="cw-send" onClick={submitText} aria-label="Send message">
            <IconSend width={18} height={18} />
          </button>
        )}

        {!recording && !canSend && (
          <button
            type="button"
            class="cw-send"
            onClick={startRecording}
            aria-label="Record voice message"
            title="Record voice message"
            disabled={props.disabled}
          >
            <IconMic width={18} height={18} />
          </button>
        )}

        {recording && (
          <button type="button" class="cw-send cw-send--danger" onClick={stopAndSend} aria-label="Stop and send">
            <IconStop width={18} height={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
