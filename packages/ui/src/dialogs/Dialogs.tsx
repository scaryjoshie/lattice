import type { Id } from "@pane/kernel/model";
import type { DirectoryListing } from "@pane/protocol";
import { ArrowUp, Folder, FolderGit2, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../api/index.ts";
import { Button } from "../components/ui/button.tsx";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  Field,
} from "../components/ui/dialog.tsx";
import { Input } from "../components/ui/input.tsx";
import { ScrollArea } from "../components/ui/scroll-area.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { cn } from "../lib/utils.ts";
import { useStore } from "../store.ts";

/** Every form in the app. One is open at a time, driven by `store.dialog`. */
export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const openDialog = useStore((s) => s.openDialog);
  const close = () => openDialog(null);
  return (
    <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
      {dialog?.kind === "newProject" && <NewProject close={close} />}
      {dialog?.kind === "addRepository" && <AddRepository close={close} />}
      {dialog?.kind === "clone" && <Clone close={close} />}
      {dialog?.kind === "newWorktree" && (
        <NewWorktree repositoryId={dialog.repositoryId} close={close} />
      )}
    </Dialog>
  );
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function NewProject({ close }: { close(): void }) {
  const [name, setName] = useState("");
  const [goals, setGoals] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api.op("createProject", { name: name.trim(), goals: goals.trim() });
      close();
      await useStore.getState().selectProject(p.id);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogContent title="New project">
      <form onSubmit={submit}>
        <DialogBody>
          <Field label="Name" error={error}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Goals">
            <Textarea value={goals} onChange={(e) => setGoals(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function crumbs(path: string): Array<{ label: string; path: string }> {
  const parts = path.split("/").filter(Boolean);
  return [
    { label: "/", path: "/" },
    ...parts.map((p, i) => ({ label: p, path: `/${parts.slice(0, i + 1).join("/")}` })),
  ];
}

function AddRepository({ close }: { close(): void }) {
  const projectId = useStore((s) => s.projectId);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [jump, setJump] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const go = (path?: string) => {
    setError(null);
    api
      .fs(path)
      .then((l) => {
        setListing(l);
        setJump(l.path);
      })
      .catch((e) => setError(message(e)));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: load home once
  useEffect(() => {
    go();
  }, []);

  const add = async (path: string) => {
    if (!projectId) return;
    setBusy(path);
    setError(null);
    try {
      await api.op("addRepository", { projectId, path });
      close();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <DialogContent title="Add repository" className="w-[560px]">
      <DialogBody className="gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && go(listing.parent)}
            aria-label="Up"
          >
            <ArrowUp size={14} />
          </Button>
          <Input
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go(jump.trim() || undefined)}
            className="font-mono text-[12px]"
          />
        </div>
        {listing && (
          <div className="flex flex-wrap items-center gap-0.5 px-1 text-[12px] text-muted">
            {crumbs(listing.path).map((c, i) => (
              <span key={c.path} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-border">/</span>}
                <button
                  type="button"
                  className="cursor-pointer rounded-sm px-1 py-0.5 hover:bg-surface-2 hover:text-text"
                  onClick={() => go(c.path)}
                >
                  {c.label === "/" ? "" : c.label}
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="rounded-sm border border-border">
          <ScrollArea className="h-[300px]">
            {listing?.isRepository && (
              <Row
                name="."
                repository
                busy={busy === listing.path}
                onOpen={() => undefined}
                onAdd={() => void add(listing.path)}
              />
            )}
            {listing?.entries.map((e) => (
              <Row
                key={e.path}
                name={e.name}
                repository={e.isRepository}
                busy={busy === e.path}
                onOpen={() => go(e.path)}
                onAdd={() => void add(e.path)}
              />
            ))}
            {listing && listing.entries.length === 0 && !listing.isRepository && (
              <div className="px-3 py-2 text-muted">Empty</div>
            )}
          </ScrollArea>
        </div>
        {error && <div className="text-[12px] text-danger">{error}</div>}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Row({
  name,
  repository,
  busy,
  onOpen,
  onAdd,
}: {
  name: string;
  repository: boolean;
  busy: boolean;
  onOpen(): void;
  onAdd(): void;
}) {
  const cls =
    "flex h-8 w-full items-center gap-2 border-b border-border px-3 text-left last:border-b-0";
  if (!repository) {
    return (
      <button
        type="button"
        className={cn(
          cls,
          "cursor-pointer hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2",
        )}
        onClick={onOpen}
      >
        <Folder size={14} className="text-muted" />
        <span className="flex-1 truncate">{name}</span>
      </button>
    );
  }
  return (
    <div className={cls}>
      <FolderGit2 size={14} className="text-accent" />
      <span className="flex-1 truncate">{name}</span>
      <Button size="sm" variant="primary" disabled={busy} onClick={onAdd}>
        {busy && <Loader2 size={12} className="animate-spin" />} Add
      </Button>
    </div>
  );
}

function Clone({ close }: { close(): void }) {
  const projectId = useStore((s) => s.projectId);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectId || !url.trim()) return;
    setBusy(true);
    try {
      const r = await api.op("cloneRepository", { projectId, url: url.trim() });
      toast.success(`Cloned ${r.repository.name}`);
      close();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogContent title="Clone">
      <form onSubmit={submit}>
        <DialogBody>
          <Field label="URL" error={error}>
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-[12px]"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!url.trim() || busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Clone
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function NewWorktree({ repositoryId, close }: { repositoryId: Id<"repository">; close(): void }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.op("createWorktree", {
        repositoryId,
        name: name.trim(),
        objective: objective.trim(),
      });
      close();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogContent title="New worktree">
      <form onSubmit={submit}>
        <DialogBody>
          <Field label="Name" error={error}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Objective">
            <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
