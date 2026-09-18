import type { Id } from "@pane/kernel/model";
import { X } from "lucide-react";
import { useState } from "react";
import { api } from "../api/index.ts";
import { providerIcon } from "../canvas/nodes/AgentNode.tsx";
import { agentHome, agentLocation, titleOf } from "../lib/names.ts";
import { useStore } from "../store.ts";
import { Button } from "../ui/Button.tsx";
import { Input } from "../ui/Input.tsx";
import { Pill, statusTone } from "../ui/Pill.tsx";

export function AgentCard({ id }: { id: Id<"agent"> }) {
  const snapshot = useStore((s) => s.snapshot);
  const presence = useStore((s) => s.presence[id]);
  const setPanel = useStore((s) => s.setPanel);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const a = snapshot?.agents.find((x) => x.id === id);
  if (!snapshot || !a) return null;
  const home = agentHome(snapshot, a.id);
  const loc = agentLocation(snapshot, a.id);
  const others = snapshot.agents.filter((o) => o.id !== a.id && o.lifecycle !== "archived");
  const running = a.lifecycle === "online";

  const message = async (other: Id<"agent">) => {
    const c = await api.op("openDm", { projectId: snapshot.project.id, a: a.id, b: other });
    setPicking(false);
    setPanel({ kind: "chat", id: c.id });
  };

  return (
    <>
      <div className="panel-header">
        {providerIcon(a.provider)}
        {editing ? (
          <Input
            initial={a.name}
            onSubmit={(name) => {
              setEditing(false);
              void api.op("updateAgent", { agentId: a.id, name });
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            className="title editable"
            style={{ background: "none", border: 0 }}
            onClick={() => setEditing(true)}
          >
            {a.name}
          </button>
        )}
        <Pill tone={statusTone(a.lifecycle)}>{presence?.status ?? a.lifecycle}</Pill>
        <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
          <X size={14} />
        </Button>
      </div>
      <div className="panel-body">
        <dl className="kv">
          <dt>Provider</dt>
          <dd>{a.provider}</dd>
          {a.model && (
            <>
              <dt>Model</dt>
              <dd>{a.model}</dd>
            </>
          )}
          <dt>Assigned</dt>
          <dd>{home ? titleOf(snapshot, home) : "—"}</dd>
          {loc && loc !== home && (
            <>
              <dt>Located</dt>
              <dd style={{ color: "var(--warn)" }}>{titleOf(snapshot, loc)}</dd>
            </>
          )}
          {presence?.pid && (
            <>
              <dt>Pid</dt>
              <dd>{presence.pid}</dd>
            </>
          )}
          {a.forkedFromId && (
            <>
              <dt>Forked from</dt>
              <dd>{titleOf(snapshot, a.forkedFromId)}</dd>
            </>
          )}
        </dl>
        <div className="chips">
          {running ? (
            <Button size="sm" onClick={() => void api.op("stopAgent", { agentId: a.id })}>
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={a.lifecycle === "archived"}
              onClick={() => void api.op("startAgent", { agentId: a.id })}
            >
              Start
            </Button>
          )}
          <Button
            size="sm"
            disabled={!running}
            onClick={() => void api.op("interruptAgent", { agentId: a.id })}
          >
            Interrupt
          </Button>
          <Button size="sm" onClick={() => void api.op("forkAgent", { agentId: a.id })}>
            Fork
          </Button>
          <Button size="sm" disabled={!others.length} onClick={() => setPicking(!picking)}>
            Message
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={a.lifecycle === "archived"}
            onClick={() => void api.op("archiveAgent", { agentId: a.id })}
          >
            Archive
          </Button>
        </div>
        {picking && (
          <div className="list">
            {others.map((o) => (
              <button type="button" className="row" key={o.id} onClick={() => void message(o.id)}>
                {providerIcon(o.provider, 14)}
                <span className="grow">{o.name}</span>
                <span className="muted small">
                  {titleOf(snapshot, agentHome(snapshot, o.id) ?? "")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
