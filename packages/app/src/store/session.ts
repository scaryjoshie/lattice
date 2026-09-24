import { create } from "zustand";
import { initial, reduce, type Session, type SessionCommand } from "../session/session.ts";

/**
 * The session, held outside React. Pointer-speed changes go through here without a
 * render; React subscribes to the slices it draws overlays from and nothing else.
 */
interface Store {
  session: Session;
  apply(command: SessionCommand): void;
}

export const useSession = create<Store>((set) => ({
  session: initial,
  apply(command) {
    set((s) => ({ session: reduce(s.session, command) }));
  },
}));
