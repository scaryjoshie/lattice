import { create } from "zustand";
import type { ClientMessage, PaneState, Provider, ServerMessage } from "../protocol.ts";
import { terminalBus } from "./terminal/bus.ts";

/**
 * View state only. The daemon owns which panes exist; the canvas owns where they are,
 * because position is a surface concern and nothing else should have an opinion on it.
 */

export interface Point {
  x: number;
  y: number;
}

interface Store {
  connected: boolean;
  panes: PaneState[];
  positions: Record<string, Point>;
  /** The pane the camera is inside. Exactly one, or none. */
  entered: string | null;
  spawn(provider: Provider, at: Point): void;
  remove(id: string): void;
  move(id: string, at: Point): void;
  enter(id: string): void;
  exit(): void;
  send(msg: ClientMessage): void;
}

let socket: WebSocket | null = null;
/** Where the next pane the daemon reports should land, set by whatever asked for it. */
let pendingPosition: Point | null = null;

export const useStore = create<Store>((set, get) => ({
  connected: false,
  panes: [],
  positions: {},
  entered: null,
  send(msg) {
    socket?.send(JSON.stringify(msg));
  },
  spawn(provider, at) {
    pendingPosition = at;
    get().send({ t: "spawn", provider });
  },
  remove(id) {
    if (get().entered === id) set({ entered: null });
    get().send({ t: "remove", id });
  },
  move(id, at) {
    set((s) => ({ positions: { ...s.positions, [id]: at } }));
  },
  enter(id) {
    set({ entered: id });
  },
  exit() {
    set({ entered: null });
  },
}));

function place(panes: PaneState[]): void {
  const { positions } = useStore.getState();
  const next = { ...positions };
  let changed = false;
  for (const pane of panes) {
    if (next[pane.id]) continue;
    next[pane.id] = pendingPosition ?? { x: 0, y: 0 };
    pendingPosition = null;
    changed = true;
  }
  if (changed) useStore.setState({ positions: next });
}

export function connect(): void {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => useStore.setState({ connected: true });
  ws.onclose = () => {
    useStore.setState({ connected: false });
    socket = null;
    setTimeout(connect, 1000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as ServerMessage;
    switch (msg.t) {
      case "panes":
        place(msg.panes);
        useStore.setState({ panes: msg.panes });
        break;
      case "replay":
        terminalBus.emit(msg.id, (l) => l.replay(msg.b64));
        break;
      case "data":
        terminalBus.emit(msg.id, (l) => l.data(msg.b64));
        break;
      case "exit":
        terminalBus.emit(msg.id, (l) => l.exit(msg.code));
        break;
    }
  };
}
