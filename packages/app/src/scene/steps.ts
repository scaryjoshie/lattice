import { isRun } from "@lattice/model";
import type { Step } from "@lattice/protocol";
import { idleOf, OCCUPANTS } from "../occupants/index.ts";
import type { Facts } from "../runtime/facts.ts";

/** What a history row shows: the act, as a glyph the view draws, and what it was done to. */
export interface StepView {
  readonly act: "place" | "remove" | "move" | "resize" | "text" | "name";
  readonly label: string;
}

/** Longest a label runs before it is cut. */
const ROOM = 22;
const cut = (s: string) => (s.length > ROOM ? `${s.slice(0, ROOM - 1)}…` : s);

/**
 * A step as a history row, in the fewest words that tell it apart: a placed agent is its
 * occupant's label, a host its name if it has one, text its words, a worktree its name.
 * Hosting is a fact rather than part of the step, so an agent is named by what the host
 * holds now, or by its surface's idle occupant.
 */
export function viewOf(step: Step, facts: Facts): StepView {
  const subject = step.subject;
  const what = (): string => {
    if (!subject) return step.carried > 1 ? `${step.carried} items` : "item";
    if ("rowStart" in subject) return subject.name;
    if (isRun(subject)) return subject.text.trim() ? `"${subject.text.trim().split("\n")[0]}"` : subject.style;
    return subject.name ?? OCCUPANTS[facts.hosting[subject.id] ?? idleOf(subject.surface)].label;
  };
  switch (step.command.kind) {
    case "place":
      return { act: "place", label: cut(what()) };
    case "remove":
      return { act: "remove", label: cut(what()) };
    case "move":
      return { act: "move", label: cut(what()) };
    case "resize":
      return { act: "resize", label: cut(what()) };
    case "setText":
      return { act: "text", label: cut(what()) };
    case "setName":
      return { act: "name", label: cut(step.command.name.trim() || what()) };
  }
}
