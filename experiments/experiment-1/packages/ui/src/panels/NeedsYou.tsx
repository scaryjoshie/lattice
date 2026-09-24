import type { AttentionRequest } from "@pane/kernel/model";
import { Eye, Hand, HelpCircle, MessageSquare, ShieldCheck, Unlock } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { scopeName } from "../lib/names.ts";
import { run, useStore } from "../store.ts";
import { EmptyLine, GroupTitle, Item, PanelBody, PanelHeader, PanelTitle } from "./shell.tsx";

const GLYPH: Record<AttentionRequest["kind"], React.ReactNode> = {
  decision: <HelpCircle size={14} />,
  approval: <ShieldCheck size={14} />,
  review: <Eye size={14} />,
  input: <MessageSquare size={14} />,
  manual_action: <Hand size={14} />,
  unblock: <Unlock size={14} />,
};

function Row({ a }: { a: AttentionRequest }) {
  const snapshot = useStore((s) => s.snapshot);
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [title, setTitle] = useState("");
  const resolve = () => {
    if (!resolution.trim()) return;
    void run("resolveAttention", {
      attentionId: a.id,
      resolution: resolution.trim(),
      decision:
        a.kind === "decision" && title.trim()
          ? { title: title.trim(), rationale: resolution.trim() }
          : undefined,
    });
  };
  return (
    <Item>
      <span className="mt-0.5 text-muted">{GLYPH[a.kind]}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 text-left"
          onClick={() => setOpen(!open)}
        >
          <span className="flex-1">{a.title}</span>
          <span className="text-[12px] text-muted">{scopeName(snapshot, a.scopeId)}</span>
        </button>
        {open && (
          <div className="flex flex-col gap-2">
            {a.description && <div className="text-[12px] text-muted">{a.description}</div>}
            {a.kind === "decision" && (
              <Input
                placeholder="Decision"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
            <Textarea
              placeholder="Resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
            <div className="flex gap-1.5">
              <Button size="sm" variant="primary" disabled={!resolution.trim()} onClick={resolve}>
                Resolve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void run("dismissAttention", { attentionId: a.id })}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </Item>
  );
}

export function NeedsYou() {
  const items = useStore((s) => s.needsYou);
  const blocking = items.filter((a) => a.blocking);
  const later = items.filter((a) => !a.blocking);
  return (
    <>
      <PanelHeader>
        <PanelTitle>Needs you</PanelTitle>
      </PanelHeader>
      <PanelBody>
        {items.length === 0 && <EmptyLine>Nothing needs you</EmptyLine>}
        {blocking.length > 0 && (
          <div>
            <GroupTitle>Blocking</GroupTitle>
            {blocking.map((a) => (
              <Row a={a} key={a.id} />
            ))}
          </div>
        )}
        {later.length > 0 && (
          <div>
            <GroupTitle>Later</GroupTitle>
            {later.map((a) => (
              <Row a={a} key={a.id} />
            ))}
          </div>
        )}
      </PanelBody>
    </>
  );
}
