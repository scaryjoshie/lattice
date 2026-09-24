import type { Id } from "@pane/kernel/model";
import { useState } from "react";
import { providerIcon } from "../canvas/nodes/AgentNode.tsx";
import { Badge, statusTone } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { Input } from "../components/ui/input.tsx";
import { agentHome, agentLocation, titleOf } from "../lib/names.ts";
import { run, useStore } from "../store.ts";
import { Kv, PanelBody, PanelHeader } from "./shell.tsx";

export function AgentCard({ id }: { id: Id<"agent"> }) {
  const snapshot = useStore((s) => s.snapshot);
  const presence = useStore((s) => s.presence[id]);
  const setPanel = useStore((s) => s.setPanel);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const a = snapshot?.agents.find((x) => x.id === id);
  if (!snapshot || !a) return null;
  const home = agentHome(snapshot, a.id);
  const loc = agentLocation(snapshot, a.id);
  const others = snapshot.agents.filter((o) => o.id !== a.id && o.lifecycle !== "archived");
  const running = a.lifecycle === "online";

  const message = async (other: Id<"agent">) => {
    const c = await run("openDm", { projectId: snapshot.project.id, a: a.id, b: other });
    if (c) setPanel({ kind: "chat", id: c.id });
  };

  return (
    <>
      <PanelHeader>
        <span className="text-muted">{providerIcon(a.provider)}</span>
        {editing ? (
          <Input
            autoFocus
            value={name}
            className="h-7"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && name.trim()) {
                setEditing(false);
                void run("updateAgent", { agentId: a.id, name: name.trim() });
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="-mx-1 flex-1 cursor-text truncate rounded-sm px-1 text-left font-semibold hover:bg-surface-2"
            onClick={() => {
              setName(a.name);
              setEditing(true);
            }}
          >
            {a.name}
          </button>
        )}
        <Badge tone={statusTone(presence?.status ?? a.lifecycle)}>
          {presence?.status ?? a.lifecycle}
        </Badge>
      </PanelHeader>
      <PanelBody>
        <Kv
          rows={[
            ["Provider", a.provider],
            a.model !== null && ["Model", a.model],
            ["Assigned", home ? titleOf(snapshot, home) : "—"],
            loc !== null &&
              loc !== home && [
                "Located",
                <span key="loc" className="text-warn">
                  {titleOf(snapshot, loc)}
                </span>,
              ],
            presence?.pid !== null && presence?.pid !== undefined && ["Pid", presence.pid],
            a.forkedFromId !== null && ["Forked from", titleOf(snapshot, a.forkedFromId)],
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {running ? (
            <Button size="sm" onClick={() => void run("stopAgent", { agentId: a.id })}>
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={a.lifecycle === "archived"}
              onClick={() => void run("startAgent", { agentId: a.id })}
            >
              Start
            </Button>
          )}
          <Button
            size="sm"
            disabled={!running}
            onClick={() => void run("interruptAgent", { agentId: a.id })}
          >
            Interrupt
          </Button>
          <Button size="sm" onClick={() => void run("forkAgent", { agentId: a.id })}>
            Fork
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={!others.length}>
                Message
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {others.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => void message(o.id)}>
                  {providerIcon(o.provider, 14)}
                  <span className="flex-1">{o.name}</span>
                  <span className="text-[12px] text-muted">
                    {titleOf(snapshot, agentHome(snapshot, o.id) ?? "")}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="destructive"
            disabled={a.lifecycle === "archived"}
            onClick={() => void run("archiveAgent", { agentId: a.id })}
          >
            Archive
          </Button>
        </div>
      </PanelBody>
    </>
  );
}
