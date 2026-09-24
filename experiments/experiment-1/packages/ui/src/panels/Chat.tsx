import type { Id, Message } from "@pane/kernel/model";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/index.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { ScrollArea } from "../components/ui/scroll-area.tsx";
import { timeAgo, titleOf } from "../lib/names.ts";
import { run, useStore } from "../store.ts";
import { EmptyLine, PanelHeader, PanelTitle } from "./shell.tsx";

/** One conversation: history newest at the bottom, a composer. */
export function Chat({ id, embedded = false }: { id: Id<"conversation">; embedded?: boolean }) {
  const snapshot = useStore((s) => s.snapshot);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const version = snapshot?.conversations.find((c) => c.id === id)?.messageCount ?? 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the refetch trigger
  useEffect(() => {
    let alive = true;
    api.messages(id, { limit: 100 }).then((m) => alive && setMessages(m));
    void api.op("markRead", { conversationId: id }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    void run("sendMessage", { conversationId: id, body });
  };

  const body = (
    <>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2.5 px-3 py-3">
          {messages.length === 0 && <EmptyLine>No messages</EmptyLine>}
          {messages.map((m) => (
            <div key={m.id}>
              <div className="flex gap-1.5 text-[11px] text-muted">
                <span>{titleOf(snapshot, m.fromActorId)}</span>
                <span>{timeAgo(m.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>
      <div className="flex flex-none gap-1.5 border-t border-border px-3 py-2.5">
        <Input
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
      <PanelHeader>
        <PanelTitle>{titleOf(snapshot, id)}</PanelTitle>
      </PanelHeader>
      {body}
    </>
  );
}
