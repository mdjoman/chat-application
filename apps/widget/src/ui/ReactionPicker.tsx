const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function ReactionPicker(props: {
  onPick: (reaction: string) => void;
}) {
  return (
    <div class="cw-emoji">
      {REACTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => props.onPick(r)}
          aria-label={`React ${r}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
