import { useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../services/api-client';
import type { CallDTO } from '../types';
import { IconBack, IconPhone, IconVideo } from './Icons';
import { store } from '../state/store';
import { formatLocalDateTime, formatDuration } from '../utils/time';

export function CallHistory(props: {
  api: ApiClient;
  onBack: () => void;
}) {
  const [items, setItems] = useState<CallDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    props.api.callHistory(30).then((p) => setItems(p.items)).finally(() => setLoading(false));
  }, [props.api]);

  function labelFor(c: CallDTO): string {
    const me = store.get().me;
    const others = c.participants.filter((p) => p.userId !== me?.id);
    if (others.length === 0) return 'Unknown';
    return `User #${others[0]!.userId}`;
  }

  function isMissed(c: CallDTO): boolean {
    return c.status === 'missed' || c.endReason === 'timeout';
  }

  function isOutgoing(c: CallDTO): boolean {
    return c.initiatedBy === store.get().me?.id;
  }

  return (
    <div class="cw-chat">
      <div class="cw-chat__header">
        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onBack} aria-label="Back">
          <IconBack />
        </button>
        <div style={{ flex: 1, fontWeight: 700 }}>Calls</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div class="cw-empty"><div class="cw-spinner" /></div>}
        {!loading && items.length === 0 && (
          <div class="cw-empty">No calls yet</div>
        )}
        {items.map((c) => (
          <div key={c.id} class="cw-conv" style={{ cursor: 'default' }}>
            <div class="cw-avatar">
              {c.callType === 'video' ? '🎥' : '📞'}
            </div>
            <div class="cw-conv__body">
              <div class="cw-conv__title" style={{ color: isMissed(c) ? '#EF4444' : undefined }}>
                {labelFor(c)}
                {c.callType === 'video' ? ' Video' : ' Audio'}
                {isMissed(c) ? ' (Missed)' : ''}
              </div>
              <div class="cw-conv__preview">
                {isOutgoing(c) ? '↗ Outgoing' : '↙ Incoming'} ·{' '}
                {formatLocalDateTime(c.startedAt)}
                {c.durationSeconds ? ` · ${formatDuration(c.durationSeconds)}` : ''}
              </div>
            </div>
            <button type="button" class="cw-icon-btn cw-icon-btn--ghost" title="Call back">
              {c.callType === 'video' ? <IconVideo width={16} height={16} /> : <IconPhone width={16} height={16} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}