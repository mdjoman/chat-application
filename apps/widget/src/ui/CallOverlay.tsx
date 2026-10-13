import { useEffect, useRef } from 'preact/hooks';
import {
  IconPhoneOff,
  IconMic,
  IconMicOff,
  IconVideo,
  IconScreen,
} from './Icons';
import type { CallDTO, CallParticipantDTO } from '../types';
import { formatDuration } from '../utils/time';

export function CallOverlay(props: {
  call: CallDTO;
  direction: 'outgoing' | 'incoming';
  status: 'ringing' | 'connecting' | 'connected' | 'ended';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micMuted: boolean;
  cameraOn: boolean;
  quality: { level: 'excellent' | 'good' | 'poor'; rtt: number; packetLoss: number };
  peerLabel: string;
  onAccept: () => void;
  onReject: () => void;
  onHangUp: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (localRef.current && props.localStream) {
      localRef.current.srcObject = props.localStream;
    }
  }, [props.localStream]);

  useEffect(() => {
    if (remoteRef.current && props.remoteStream) {
      remoteRef.current.srcObject = props.remoteStream;
    }
  }, [props.remoteStream]);

  const isVideo = props.call.callType === 'video';
  const isIncoming = props.direction === 'incoming' && props.status === 'ringing';
  const showConnectedTimer = props.status === 'connected' || props.status === 'connecting';

  return (
    <div class="cw-call" role="dialog" aria-label="Call">
      <div class="cw-call__stage">
        {isVideo ? (
          <video ref={remoteRef} autoPlay playsInline class="cw-call__remote" />
        ) : (
          <div class="cw-call__avatar">
            <div class="cw-avatar cw-avatar--xl">{initials(props.peerLabel)}</div>
          </div>
        )}

        {isVideo && props.cameraOn && (
          <video ref={localRef} autoPlay playsInline muted class="cw-call__local" />
        )}

        <div class="cw-call__meta">
          <div class="cw-call__name">{props.peerLabel}</div>
          <div class="cw-call__status">
            {props.status === 'ringing' && (isIncoming ? 'Incoming call…' : 'Ringing…')}
            {props.status === 'connecting' && 'Connecting…'}
            {props.status === 'connected' && 'Connected'}
            {props.status === 'ended' && 'Call ended'}
          </div>
          {showConnectedTimer && (
            <div class={`cw-call__quality cw-call__quality--${props.quality.level}`}>
              <span class="cw-call__dot" />
              {props.quality.level} · {Math.round(props.quality.rtt * 1000)}ms
            </div>
          )}
        </div>
      </div>

      <div class="cw-call__controls">
        {isIncoming ? (
          <>
            <button
              type="button"
              class="cw-ctrl cw-ctrl--danger"
              onClick={props.onReject}
              aria-label="Decline"
            >
              <IconPhoneOff />
            </button>
            <button
              type="button"
              class="cw-ctrl cw-ctrl--accept"
              onClick={props.onAccept}
              aria-label="Accept"
            >
              📞
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              class={props.micMuted ? 'cw-ctrl cw-ctrl--active' : 'cw-ctrl'}
              onClick={props.onToggleMic}
              aria-label={props.micMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {props.micMuted ? <IconMicOff /> : <IconMic />}
            </button>

            {isVideo && (
              <>
                <button
                  type="button"
                  class={!props.cameraOn ? 'cw-ctrl cw-ctrl--active' : 'cw-ctrl'}
                  onClick={props.onToggleCamera}
                  aria-label={props.cameraOn ? 'Turn camera off' : 'Turn camera on'}
                >
                  <IconVideo />
                </button>
                <button
                  type="button"
                  class="cw-ctrl"
                  onClick={props.onSwitchCamera}
                  aria-label="Switch camera"
                  title="Switch camera"
                >
                  🔄
                </button>
              </>
            )}

            <button
              type="button"
              class="cw-ctrl"
              aria-label="Share screen"
              title="Share screen (Phase 8)"
              disabled
            >
              <IconScreen />
            </button>

            <button
              type="button"
              class="cw-ctrl cw-ctrl--danger"
              onClick={props.onHangUp}
              aria-label="Hang up"
            >
              <IconPhoneOff />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((s) => s[0] || '').join('').slice(0, 2).toUpperCase();
}

// silence unused type
export type _CallParticipant = CallParticipantDTO;