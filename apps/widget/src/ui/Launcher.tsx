import { IconChat, IconClose } from './Icons';

export function Launcher(props: {
  open: boolean;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="cw-launcher"
      aria-label={props.open ? 'Close chat' : 'Open chat'}
      onClick={props.onClick}
      style={{ position: 'relative' }}
    >
      {props.open ? <IconClose width={22} height={22} /> : <IconChat width={24} height={24} />}
      {!props.open && props.unread > 0 && (
        <span class="cw-launcher__badge">{props.unread > 99 ? '99+' : props.unread}</span>
      )}
    </button>
  );
}
