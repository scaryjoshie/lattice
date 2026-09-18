import type { Id, Message } from "@pane/kernel/model";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/index.ts";
import { timeAgo, titleOf } from "../lib/names.ts";
import { useStore } from "../store.ts";
import { Button } from "../ui/Button.tsx";

/** One conversation: history newest at the bottom, a composer. */
export function Chat({ id, embedded = false }: { id: Id<"conversation">; embedded?: boolean }) {
  const snapshot = useStore((s) => s.snapshot);
  const setPanel = useStore((s) => s.setPanel);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const version = snapshot?.conversations.find((c) => c.id === id)?.messageCount ?? 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the refetch trigger
  useEffect(() => {
    let alive = true;
    api.messages(id, { limit: 100 }).then((m) => alive && setMessages(m));
    void api.op("markRead", { conversationId: id });
    return () => {
      alive = false;
    };
  }, [id, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages change
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    void api.op("sendMessage", { conversationId: id, body });
  };

  const body = (
    <>
      <div className="msgs" style={{ flex: 1 }}>
        {messages.length === 0 && <div className="empty">No messages</div>}
        {messages.map((m) => (
          <div className="msg" key={m.id}>
            <div className="who">
              <span>{titleOf(snapshot, m.fromActorId)}</span>
              <span>{timeAgo(m.createdAt)}</span>
            </div>
            <div className="body">{m.body}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="form" style={{ marginTop: 8 }}>
        <input
          placeholder="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <Button variant="primary" onClick={send} disabled={!draft.trim()}>
          Send
        </Button>
      </div>
    </>
  );
  if (embedded) return body;
  return (
    <>
      <div className="panel-header">
        <span className="title">{titleOf(snapshot, id)}</span>
        <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
          <X size={14} />
        </Button>
      </div>
      <div className="panel-body">{body}</div>
    </>
  );
}
