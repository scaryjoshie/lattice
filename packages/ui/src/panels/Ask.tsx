import { X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { api } from "../api/index.ts";
import { titleOf } from "../lib/names.ts";
import { useStore } from "../store.ts";
import { Button } from "../ui/Button.tsx";
import { Input } from "../ui/Input.tsx";

/** The bar at the bottom in Ask mode: selection chips and the question. */
export function AskBar() {
  const snapshot = useStore((s) => s.snapshot);
  const selection = useStore((s) => s.selection);
  const askAnswer = useStore((s) => s.askAnswer);
  const { setAskAnswer, setMode } = useStore.getState();
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  const submit = async (text: string) => {
    setBusy(true);
    try {
      const a = await api.op("ask", {
        projectId: snapshot.project.id,
        refs: selection,
        text,
        conversationId: askAnswer?.conversationId,
      });
      setAskAnswer(a);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.div
      className="askbar"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.16 }}
    >
      <div className="chips">
        {selection.map((id) => (
          <span className="chip" key={id}>
            {titleOf(snapshot, id)}
          </span>
        ))}
        {selection.length === 0 && <span className="hint">{snapshot.project.name}</span>}
        <span className="spacer" />
        <Button variant="ghost" size="sm" onClick={() => setMode("normal")}>
          <X size={12} />
        </Button>
      </div>
      <Input
        placeholder={busy ? "…" : "Ask"}
        onSubmit={(t) => void submit(t)}
        onCancel={() => undefined}
      />
    </motion.div>
  );
}

const LEVEL: Record<string, string> = {
  recorded: "Recorded",
  actor: "From",
  reconstructed: "Reconstructed",
  none: "No answer",
};

export function AskPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const a = useStore((s) => s.askAnswer);
  const setPanel = useStore((s) => s.setPanel);
  const [saving, setSaving] = useState(false);
  if (!snapshot || !a) return null;
  const level =
    a.level === "actor" ? `From ${a.respondents.map((r) => r.name).join(", ")}` : LEVEL[a.level];
  const scope =
    snapshot.worktrees.find((w) => w.id === snapshot.worktrees[0]?.id)?.id ?? snapshot.project.id;
  return (
    <>
      <div className="panel-header">
        <span className="level" style={{ flex: 1 }}>
          {level}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
          <X size={14} />
        </Button>
      </div>
      <div className="panel-body">
        <div className="answer">{a.text}</div>
        {a.sources.length > 0 && (
          <div className="chips">
            {a.sources.map((s) => (
              <span className="chip" key={s.id} title={s.id}>
                {s.title}
              </span>
            ))}
          </div>
        )}
        {a.respondents
          .filter((r) => a.respondents.length > 1 || r.text !== a.text)
          .map((r) => (
            <div className="msg" key={r.actorId}>
              <div className="who">{r.name}</div>
              <div className="body">{r.text}</div>
            </div>
          ))}
        {a.proposal && (
          <div>
            {a.proposal.map((p) => (
              <div className="item" key={p.summary}>
                <div className="grow">{p.summary}</div>
              </div>
            ))}
            <Button
              variant="primary"
              size="sm"
              onClick={() => void api.op("applyProposal", { ops: a.proposal ?? [] })}
            >
              Apply
            </Button>
          </div>
        )}
      </div>
      <div className="panel-footer">
        {saving ? (
          <Input
            placeholder="Decision"
            onSubmit={(title) => {
              setSaving(false);
              void api.op("recordDecision", {
                scopeId: scope,
                title,
                rationale: a.text,
                derivedFrom: [a.conversationId],
              });
            }}
            onCancel={() => setSaving(false)}
          />
        ) : (
          <Button size="sm" disabled={a.level === "none"} onClick={() => setSaving(true)}>
            Save as decision
          </Button>
        )}
      </div>
    </>
  );
}
