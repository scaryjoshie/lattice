import { X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { titleOf } from "../lib/names.ts";
import { run, useStore } from "../store.ts";
import { Item, PanelBody, PanelHeader } from "./shell.tsx";

/** The bar at the bottom in Ask mode: selection chips and the question. */
export function AskBar() {
  const snapshot = useStore((s) => s.snapshot);
  const selection = useStore((s) => s.selection);
  const askAnswer = useStore((s) => s.askAnswer);
  const { setAskAnswer, setMode } = useStore.getState();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const a = await run("ask", {
      projectId: snapshot.project.id,
      refs: selection,
      text: t,
      conversationId: askAnswer?.conversationId,
    });
    setBusy(false);
    if (a) {
      setText("");
      setAskAnswer(a);
    }
  };
  return (
    <motion.div
      className="absolute bottom-5 left-1/2 z-[6] flex w-[min(720px,calc(100%-40px))] -translate-x-1/2 flex-col gap-1.5 rounded-xl border border-accent bg-surface p-2.5 shadow-md"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      <div className="flex flex-wrap items-center gap-1">
        {selection.map((id) => (
          <Badge tone="accent" key={id}>
            {titleOf(snapshot, id)}
          </Badge>
        ))}
        {selection.length === 0 && (
          <span className="font-mono text-[11px] text-muted">{snapshot.project.name}</span>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMode("normal")}>
          <X size={12} />
        </Button>
      </div>
      <Input
        autoFocus
        className="border-0 bg-transparent px-1 focus-visible:ring-0"
        placeholder={busy ? "…" : "Ask"}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
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
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  if (!snapshot || !a) return null;
  const level =
    a.level === "actor" ? `From ${a.respondents.map((r) => r.name).join(", ")}` : LEVEL[a.level];
  const scope =
    snapshot.worktrees.find((w) => w.id === snapshot.worktrees[0]?.id)?.id ?? snapshot.project.id;
  return (
    <>
      <PanelHeader>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-accent">
          {level}
        </span>
      </PanelHeader>
      <PanelBody>
        <div className="whitespace-pre-wrap">{a.text}</div>
        {a.sources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {a.sources.map((s) => (
              <Badge tone="accent" key={s.id} title={s.id}>
                {s.title}
              </Badge>
            ))}
          </div>
        )}
        {a.respondents
          .filter((r) => a.respondents.length > 1 || r.text !== a.text)
          .map((r) => (
            <div key={r.actorId}>
              <div className="text-[11px] text-muted">{r.name}</div>
              <div className="whitespace-pre-wrap">{r.text}</div>
            </div>
          ))}
        {a.proposal && (
          <div className="flex flex-col gap-2">
            {a.proposal.map((p) => (
              <Item key={p.summary}>
                <div className="flex-1">{p.summary}</div>
              </Item>
            ))}
            <Button
              variant="primary"
              size="sm"
              className="self-start"
              onClick={() => void run("applyProposal", { ops: a.proposal ?? [] })}
            >
              Apply
            </Button>
          </div>
        )}
      </PanelBody>
      <div className="flex flex-none gap-2 border-t border-border px-3 py-2.5">
        {saving ? (
          <Input
            autoFocus
            placeholder="Decision"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSaving(false);
              if (e.key === "Enter" && title.trim()) {
                setSaving(false);
                void run("recordDecision", {
                  scopeId: scope,
                  title: title.trim(),
                  rationale: a.text,
                  derivedFrom: [a.conversationId],
                });
              }
            }}
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
