import type { Conversation } from "../types";

export function ConversationList(props: {
  conversations: Conversation[];
  meId: number;
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  if (props.conversations.length === 0) {
    return (
      <div class="cw-list">
        {" "}
        <div class="cw-empty">
          {" "}
          <p>No conversations yet</p>{" "}
          <p style={{ fontSize: 12, marginTop: 6 }}>
            {" "}
            Conversations appear here once created.{" "}
          </p>{" "}
        </div>{" "}
      </div>
    );
  }
  return (
    <div class="cw-list">
      {" "}
      {props.conversations.map((c) => {
        const other = c.members.find((m) => m.userId !== props.meId);
        const title =
          c.type === "group"
            ? (c.name ?? "Group")
            : `User #${other?.userId ?? "?"}`;
        const initials = title
          .split(" ")
          .map((s) => s[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div
            key={c.id}
            class="cw-conv"
            data-active={c.id === props.activeId}
            onClick={() => props.onSelect(c.id)}
          >
            {" "}
            <div class="cw-avatar">{initials}</div>{" "}
            <div class="cw-conv__body">
              {" "}
              <div class="cw-conv__title">{title}</div>{" "}
              <div class="cw-conv__preview">
                {" "}
                {c.type === "group"
                  ? `${c.members.length} members`
                  : "Direct message"}{" "}
              </div>{" "}
            </div>{" "}
          </div>
        );
      })}{" "}
    </div>
  );
}
