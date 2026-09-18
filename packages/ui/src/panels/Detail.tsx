import type { Id, ProjectSnapshot, Task, Worktree } from "@pane/kernel/model";
import type { WorktreeGit } from "@pane/protocol";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/index.ts";
import { Badge, statusTone } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { timeAgo } from "../lib/names.ts";
import { run, useStore } from "../store.ts";
import { Chat } from "./Chat.tsx";
import { EmptyLine, GroupTitle, Item, Kv, PanelBody, PanelHeader, PanelTitle } from "./shell.tsx";

const TABS = ["Tasks", "Problems", "Questions", "Decisions", "Chat", "Git"] as const;

export function Detail({ id }: { id: Id<"worktree"> }) {
  const snapshot = useStore((s) => s.snapshot);
  const [editing, setEditing] = useState(false);
  const [objective, setObjective] = useState("");
  const w = snapshot?.worktrees.find((x) => x.id === id);
  if (!snapshot || !w) return null;
  return (
    <>
      <PanelHeader>
        <PanelTitle>{w.name}</PanelTitle>
        <Badge tone={statusTone(w.status)}>{w.status.replace("_", " ")}</Badge>
      </PanelHeader>
      <div className="px-3 pt-2.5">
        {editing ? (
          <Input
            autoFocus
            value={objective}
            placeholder="Objective"
            onChange={(e) => setObjective(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter") {
                setEditing(false);
                void run("updateWorktree", { worktreeId: w.id, objective: objective.trim() });
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={`-mx-1 w-full cursor-text rounded-sm px-1 py-0.5 text-left hover:bg-surface-2 ${w.objective ? "" : "text-muted"}`}
            onClick={() => {
              setObjective(w.objective);
              setEditing(true);
            }}
          >
            {w.objective || "Objective"}
          </button>
        )}
      </div>
      <Tabs defaultValue="Tasks" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mt-1">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="Tasks">
          <PanelBody>
            <Tasks s={snapshot} w={w} />
          </PanelBody>
        </TabsContent>
        <TabsContent value="Problems">
          <PanelBody>
            <Problems s={snapshot} w={w} />
          </PanelBody>
        </TabsContent>
        <TabsContent value="Questions">
          <PanelBody>
            <Questions s={snapshot} w={w} />
          </PanelBody>
        </TabsContent>
        <TabsContent value="Decisions">
          <PanelBody>
            <Decisions s={snapshot} w={w} />
          </PanelBody>
        </TabsContent>
        <TabsContent value="Chat">
          <Room s={snapshot} w={w} />
        </TabsContent>
        <TabsContent value="Git">
          <PanelBody>
            <Git w={w} />
          </PanelBody>
        </TabsContent>
      </Tabs>
    </>
  );
}

const ORDER: Task["status"][] = ["in_progress", "blocked", "open", "done", "cancelled"];

function Tasks({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const [title, setTitle] = useState("");
  const tasks = s.tasks.filter((t) => t.scopeId === w.id);
  const deps = (t: Task) =>
    s.relations.filter((r) => r.sourceId === t.id && r.type === "depends_on").length;
  return (
    <>
      {tasks.length === 0 && <EmptyLine>No tasks</EmptyLine>}
      {ORDER.filter((st) => tasks.some((t) => t.status === st)).map((st) => (
        <div key={st}>
          <GroupTitle>{st.replace("_", " ")}</GroupTitle>
          {tasks
            .filter((t) => t.status === st)
            .map((t) => (
              <Item key={t.id}>
                <input
                  type="checkbox"
                  className="mt-[3px] accent-accent"
                  checked={t.status === "done"}
                  onChange={(e) =>
                    void run("setTaskStatus", {
                      taskId: t.id,
                      status: e.target.checked ? "done" : "open",
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={`flex items-center gap-1.5 ${t.status === "done" ? "text-muted line-through" : ""}`}
                  >
                    {t.title}
                    {deps(t) > 0 && (
                      <span className="text-[12px] text-muted">
                        {deps(t)} dep{deps(t) > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <div className="whitespace-pre-wrap text-[12px] text-muted">
                      {t.description}
                    </div>
                  )}
                </div>
              </Item>
            ))}
        </div>
      ))}
      <Input
        placeholder="New task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            void run("createTask", { scopeId: w.id, title: title.trim() });
            setTitle("");
          }
        }}
      />
    </>
  );
}

function Problems({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const problems = s.problems.filter((p) => p.scopeId === w.id);
  if (!problems.length) return <EmptyLine>No problems</EmptyLine>;
  return (
    <>
      {problems.map((p) => (
        <Item key={p.id}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="flex-1">{p.title}</span>
              <Badge tone={p.status === "open" ? "warn" : "default"}>{p.status}</Badge>
            </div>
            {p.description && <div className="text-[12px] text-muted">{p.description}</div>}
            {p.resolution && <div className="text-[12px] text-muted">{p.resolution}</div>}
            {p.status === "open" &&
              (resolving === p.id ? (
                <Input
                  autoFocus
                  placeholder="Resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setResolving(null);
                    if (e.key === "Enter" && resolution.trim()) {
                      void run("resolveProblem", {
                        problemId: p.id,
                        resolution: resolution.trim(),
                      });
                      setResolving(null);
                      setResolution("");
                    }
                  }}
                />
              ) : (
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setResolving(p.id)}>
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void run("dismissProblem", { problemId: p.id, reason: "dismissed" })
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              ))}
          </div>
        </Item>
      ))}
    </>
  );
}

function Questions({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const questions = s.questions.filter((q) => q.scopeId === w.id);
  if (!questions.length) return <EmptyLine>No questions</EmptyLine>;
  return (
    <>
      {questions.map((q) => (
        <Item key={q.id}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div>{q.title}</div>
            {q.description && <div className="text-[12px] text-muted">{q.description}</div>}
            {q.answer ? (
              <div className="text-[12px] text-muted">{q.answer}</div>
            ) : (
              <Input
                placeholder="Answer"
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                onKeyDown={(e) => {
                  const a = (answers[q.id] ?? "").trim();
                  if (e.key === "Enter" && a)
                    void run("answerQuestion", { questionId: q.id, answer: a });
                }}
              />
            )}
          </div>
        </Item>
      ))}
    </>
  );
}

function Decisions({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const decisions = s.decisions.filter((d) => d.scopeId === w.id);
  if (!decisions.length) return <EmptyLine>No decisions</EmptyLine>;
  return (
    <>
      {decisions.map((d) => (
        <Item key={d.id}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div>{d.title}</div>
            {d.rationale && <div className="text-[12px] text-muted">{d.rationale}</div>}
            {d.alternatives.length > 0 && (
              <ul className="m-0 list-disc pl-4 text-[12px] text-muted">
                {d.alternatives.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </Item>
      ))}
    </>
  );
}

function Room({ s, w }: { s: ProjectSnapshot; w: Worktree }) {
  const room = s.conversations.find((c) => c.kind === "group" && c.scopeId === w.id);
  if (!room)
    return (
      <PanelBody>
        <EmptyLine>No room</EmptyLine>
      </PanelBody>
    );
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
  if (!git) return <EmptyLine>No git status</EmptyLine>;
  return (
    <Kv
      rows={[
        [
          "Branch",
          <span key="b" className="font-mono">
            {git.branch}
          </span>,
        ],
        !w.isMain && [
          "Parent",
          <span key="p" className="inline-flex items-center gap-1">
            <ArrowUp size={12} /> {git.ahead} <ArrowDown size={12} /> {git.behind}
          </span>,
        ],
        ["Changes", `${git.dirtyFiles} files, +${git.insertions} −${git.deletions}`],
        [
          "Last commit",
          git.lastCommit
            ? `${git.lastCommit.sha.slice(0, 7)} ${git.lastCommit.message} · ${timeAgo(git.lastCommit.authoredAt)}`
            : "None",
        ],
      ]}
    />
  );
}
