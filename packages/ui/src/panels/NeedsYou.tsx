import type { AttentionRequest } from "@pane/kernel/model";
import { Eye, Hand, HelpCircle, MessageSquare, ShieldCheck, Unlock, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api/index.ts";
import { scopeName } from "../lib/names.ts";
import { useStore } from "../store.ts";
import { Button } from "../ui/Button.tsx";

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
    void api.op("resolveAttention", {
      attentionId: a.id,
      resolution: resolution.trim(),
      decision:
        a.kind === "decision" && title.trim()
          ? { title: title.trim(), rationale: resolution.trim() }
          : undefined,
    });
  };
  return (
    <div className="item">
      <span style={{ marginTop: 2 }}>{GLYPH[a.kind]}</span>
      <div className="grow">
        <button
          type="button"
          className="t"
          style={{
            background: "none",
            border: 0,
            padding: 0,
            textAlign: "left",
            width: "100%",
            cursor: "pointer",
          }}
          onClick={() => setOpen(!open)}
        >
          <span className="grow">{a.title}</span>
          <span className="muted small">{scopeName(snapshot, a.scopeId)}</span>
        </button>
        {open && (
          <div className="inline-form">
            {a.description && <div className="d">{a.description}</div>}
            {a.kind === "decision" && (
              <input
                placeholder="Decision"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
            <textarea
              placeholder="Resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
            <div className="form">
              <Button size="sm" variant="primary" disabled={!resolution.trim()} onClick={resolve}>
                Resolve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void api.op("dismissAttention", { attentionId: a.id })}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function NeedsYou() {
  const items = useStore((s) => s.needsYou);
  const setPanel = useStore((s) => s.setPanel);
  const blocking = items.filter((a) => a.blocking);
  const later = items.filter((a) => !a.blocking);
  return (
    <>
      <div className="panel-header">
        <span className="title">Needs you</span>
        <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
          <X size={14} />
        </Button>
      </div>
      <div className="panel-body">
        {items.length === 0 && <div className="empty">Nothing needs you</div>}
        {blocking.length > 0 && (
          <div>
            <div className="group-title">Blocking</div>
            {blocking.map((a) => (
              <Row a={a} key={a.id} />
            ))}
          </div>
        )}
        {later.length > 0 && (
          <div>
            <div className="group-title">Later</div>
            {later.map((a) => (
              <Row a={a} key={a.id} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
