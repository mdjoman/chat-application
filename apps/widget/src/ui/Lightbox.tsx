import { useEffect } from 'preact/hooks';
import { IconClose } from './Icons';

export type LightboxMedia =
  | { kind: 'image'; url: string; name?: string | null }
  | { kind: 'video'; url: string; name?: string | null };

export function Lightbox(props: {
  media: LightboxMedia | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!props.media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.media, props.onClose]);

  if (!props.media) return null;

  return (
    <div class="cw-lightbox" onClick={props.onClose} role="dialog" aria-modal="true">
      <button
        type="button"
        class="cw-lightbox__close"
        onClick={(e) => { e.stopPropagation(); props.onClose(); }}
        aria-label="Close"
      >
        <IconClose />
      </button>

      <div class="cw-lightbox__content" onClick={(e) => e.stopPropagation()}>
        {props.media.kind === 'image' && (
          <img src={props.media.url} alt={props.media.name ?? 'image'} />
        )}
        {props.media.kind === 'video' && (
          <video src={props.media.url} controls autoPlay playsInline />
        )}
      </div>

      {props.media.name && (
        <div class="cw-lightbox__caption">{props.media.name}</div>
      )}
    </div>
  );
}
