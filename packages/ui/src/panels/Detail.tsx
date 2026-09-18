import type { Id, ProjectSnapshot, Task, Worktree } from "@pane/kernel/model";
import type { WorktreeGit } from "@pane/protocol";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/index.ts";
import { timeAgo } from "../lib/names.ts";
import { useStore } from "../store.ts";
import { Button } from "../ui/Button.tsx";
import { Input } from "../ui/Input.tsx";
import { Pill, statusTone } from "../ui/Pill.tsx";
import { Tabs } from "../ui/Tabs.tsx";
import { Chat } from "./Chat.tsx";

const TABS = ["Tasks", "Problems", "Questions", "Decisions", "Chat", "Git"] as const;
type Tab = (typeof TABS)[number];

export function Detail({ id }: { id: Id<"worktree"> }) {
  const snapshot = useStore((s) => s.snapshot);
  const setPanel = useStore((s) => s.setPanel);
  const [tab, setTab] = useState<Tab>("Tasks");
  const [editing, setEditing] = useState(false);
  const w = snapshot?.worktrees.find((x) => x.id === id);
  if (!snapshot || !w) return null;
  return (
    <>
      <div className="panel-header">
        <span className="title">{w.name}</span>
        <Pill tone={statusTone(w.status)}>{w.status.replace("_", " ")}</Pill>
        <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
          <X size={14} />
        </Button>
      </div>
      <div style={{ padding: "10px 14px 0" }}>
        {editing ? (
          <Input
            initial={w.objective}
            placeholder="objective"
            onSubmit={(objective) => {
              setEditing(false);
              void api.op("updateWorktree", { worktreeId: w.id, objective });
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            className={`editable${w.objective ? "" : " muted"}`}
            style={{ background: "none", border: 0, textAlign: "left", width: "100%" }}
            onClick={() => setEditing(true)}
          >
            {w.objective || "Objective"}
          </button>
        )}
      </div>
      <Tabs<Tab> tabs={TABS} active={tab} onChange={setTab} />
      <div className="panel-body">
        {tab === "Tasks" && <Tasks s={snapshot} w={w} />}
        {tab === "Problems" && <Problems s={snapshot} w={w} />}
        {tab === "Questions" && <Questions s={snapshot} w={w} />}
        {tab === "Decisions" && <Decisions s={snapshot} w={w} />}
        {tab === "Chat" && <Room s={snapshot} w={w} />}
        {tab === "Git" && <Git w={w} />}
      </div>
    </>
  );
}

const ORDER: Task["status"][] = ["in_progress", "blocked", "open", "done", "cancelled"];

function Tasks({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const tasks = s.tasks.filter((t) => t.scopeId === w.id);
  const deps = (t: Task) =>
    s.relations.filter((r) => r.sourceId === t.id && r.type === "depends_on").length;
  return (
    <>
      {tasks.length === 0 && <div className="empty">No tasks</div>}
      {ORDER.filter((st) => tasks.some((t) => t.status === st)).map((st) => (
        <div key={st}>
          <div className="group-title">{st.replace("_", " ")}</div>
          {tasks
            .filter((t) => t.status === st)
            .map((t) => (
              <div className="item" key={t.id}>
                <input
                  type="checkbox"
                  style={{ width: "auto", marginTop: 3 }}
                  checked={t.status === "done"}
                  onChange={(e) =>
                    void api.op("setTaskStatus", {
                      taskId: t.id,
                      status: e.target.checked ? "done" : "open",
                    })
                  }
                />
                <div className="grow">
                  <div className={`t${t.status === "done" ? " done" : ""}`}>
                    {t.title}
                    {deps(t) > 0 && (
                      <span className="muted small">
                        {deps(t)} dep{deps(t) > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {t.description && <div className="d">{t.description}</div>}
                </div>
              </div>
            ))}
        </div>
      ))}
      <Input
        autoFocus={false}
        placeholder="+ task"
        onSubmit={(title) => void api.op("createTask", { scopeId: w.id, title })}
      />
    </>
  );
}

function Problems({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const [resolving, setResolving] = useState<string | null>(null);
  const problems = s.problems.filter((p) => p.scopeId === w.id);
  if (!problems.length) return <div className="empty">No problems</div>;
  return (
    <>
      {problems.map((p) => (
        <div className="item" key={p.id}>
          <div className="grow">
            <div className="t">
              {p.title}
              <Pill tone={p.status === "open" ? "warn" : "default"}>{p.status}</Pill>
            </div>
            {p.description && <div className="d">{p.description}</div>}
            {p.resolution && <div className="d">{p.resolution}</div>}
            {p.status === "open" &&
              (resolving === p.id ? (
                <Input
                  placeholder="resolution"
                  onSubmit={(resolution) =>
                    void api.op("resolveProblem", { problemId: p.id, resolution })
                  }
                  onCancel={() => setResolving(null)}
                />
              ) : (
                <div className="form" style={{ marginTop: 4 }}>
                  <Button size="sm" onClick={() => setResolving(p.id)}>
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void api.op("dismissProblem", { problemId: p.id, reason: "dismissed" })
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Questions({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const questions = s.questions.filter((q) => q.scopeId === w.id);
  if (!questions.length) return <div className="empty">No questions</div>;
  return (
    <>
      {questions.map((q) => (
        <div className="item" key={q.id}>
          <div className="grow">
            <div className="t">{q.title}</div>
            {q.description && <div className="d">{q.description}</div>}
            {q.answer ? (
              <div className="d">{q.answer}</div>
            ) : (
              <Input
                autoFocus={false}
                placeholder="answer"
                onSubmit={(answer) => void api.op("answerQuestion", { questionId: q.id, answer })}
              />
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function Decisions({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const decisions = s.decisions.filter((d) => d.scopeId === w.id);
  if (!decisions.length) return <div className="empty">No decisions</div>;
  return (
    <>
      {decisions.map((d) => (
        <div className="item" key={d.id}>
          <div className="grow">
            <div className="t">{d.title}</div>
            {d.rationale && <div className="d">{d.rationale}</div>}
            {d.alternatives.length > 0 && (
              <ul className="d" style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {d.alternatives.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function Room({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const room = s.conversations.find((c) => c.kind === "group" && c.scopeId === w.id);
  if (!room) return <div className="empty">No room</div>;
  return <Chat id={room.id} embedded />;
}

function Git({ w }: { w: Worktree }) {
  const [git, setGit] = useState<WorktreeGit | null>(null);
  useEffect(() => {
    api
      .worktreeGit(w.id)
      .then(setGit)
      .catch(() => setGit(null));
  }, [w.id]);
  if (!git) return <div className="empty">No git status</div>;
  return (
    <dl className="kv">
      <dt>Branch</dt>
      <dd style={{ fontFamily: "var(--mono)" }}>{git.branch}</dd>
      {!w.isMain && (
        <>
          <dt>Parent</dt>
          <dd>
            <ArrowUp size={12} /> {git.ahead} <ArrowDown size={12} /> {git.behind}
          </dd>
        </>
      )}
      <dt>Changes</dt>
      <dd>
        {git.dirtyFiles} files, +{git.insertions} −{git.deletions}
      </dd>
      <dt>Last commit</dt>
      <dd title={git.lastCommit?.message}>
        {git.lastCommit
          ? `${git.lastCommit.sha.slice(0, 7)} ${git.lastCommit.message} · ${timeAgo(git.lastCommit.authoredAt)}`
          : "None"}
      </dd>
    </dl>
  );
}
