import type {
  ClientFrame,
  OpName,
  OpParams,
  OpResponse,
  OpResult,
  ServerFrame,
} from "@pane/protocol";
import { type Api, ApiError, type Connection } from "./types.ts";

const RECONNECT_MS = 1000;

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } | string };
    const message =
      typeof body.error === "string" ? body.error : (body.error?.message ?? `${path}: ${r.status}`);
    throw new ApiError(message, "http");
  }
  return (await r.json()) as T;
}

export const httpApi: Api = {
  async op<N extends OpName>(name: N, params: OpParams<N>): Promise<OpResult<N>> {
    const r = await fetch("/api/op", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, params }),
    });
    const body = (await r.json()) as OpResponse<N>;
    if (!body.ok) throw new ApiError(body.error.message, body.error.code);
    return body.result;
  },
  projects: () => getJson("/api/projects"),
  snapshot: (id) => getJson(`/api/projects/${id}/snapshot`),
  messages: (id, opts = {}) => {
    const q = new URLSearchParams();
    if (opts.before !== undefined) q.set("before", String(opts.before));
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    return getJson(`/api/conversations/${id}/messages?${q}`);
  },
  needsYou: () => getJson("/api/needs-you"),
  providers: () => getJson("/api/providers"),
  presence: () => getJson("/api/agents/presence"),
  why: (id) => getJson(`/api/why/${id}`),
  worktreeGit: (id) => getJson(`/api/worktrees/${id}/git`),
  commitDiff: (id) => getJson(`/api/commits/${id}/diff`),
  fs: (path) => getJson(`/api/fs${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  connect(onFrame): Connection {
    let ws: WebSocket | null = null;
    let closed = false;
    const opened = new Map<string, ClientFrame>();
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const open = () => {
      if (closed) return;
      ws = new WebSocket(url);
      ws.onmessage = (m) => onFrame(JSON.parse(String(m.data)) as ServerFrame);
      ws.onopen = () => {
        for (const f of opened.values()) ws?.send(JSON.stringify(f));
      };
      ws.onclose = () => {
        ws = null;
        if (!closed) setTimeout(open, RECONNECT_MS);
      };
    };
    open();
    return {
      send(frame) {
        if (frame.type === "terminal.open") opened.set(frame.agentId, frame);
        if (frame.type === "terminal.close") opened.delete(frame.agentId);
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
      },
      close() {
        closed = true;
        ws?.close();
      },
    };
  },
};
