export function TypingIndicator(props: { count: number }) {
  if (props.count <= 0) return <div class="cw-typing" />;
  return (
    <div class="cw-typing">
      {props.count === 1 ? 'typing…' : `${props.count} people typing…`}
    </div>
  );
}
