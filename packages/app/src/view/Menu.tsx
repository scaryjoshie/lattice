import { type Group, Popup } from "./Popup.tsx";
import type { TextStyle } from "@lattice/model";
import { OCCUPANTS, type Stroke } from "../occupants/index.ts";
import type { Choice } from "../session/react.ts";

/**
 * What can go in a cell, grouped by what a thing is rather than by what it does. Text is
 * the grid's; everything else is an occupant from the registry, grouped by whether it is
 * an agent, so adding one adds a row here without this file changing.
 *
 * Typing filters. The input is there from the moment the menu opens so that keystrokes are
 * never lost, but stays invisible until there is something to show — the menu is a list
 * until you treat it as a search, and then it is a search.
 */

interface Item {
  label: string;
  choice: Choice;
  mark: readonly Stroke[] | TextStyle;
}

const occupants = Object.values(OCCUPANTS);
const offer = (agent: boolean): Item[] =>
  occupants.filter((o) => o.agent === agent).map((o) => ({ label: o.label, choice: { family: "host", occupant: o.id }, mark: o.mark }));

const GROUPS: readonly { heading: string; items: readonly Item[] }[] = [
  {
    heading: "text",
    items: [
      { label: "title", choice: { family: "text", style: "title" }, mark: "title" },
      { label: "note", choice: { family: "text", style: "note" }, mark: "note" },
    ],
  },
  { heading: "utilities", items: offer(false) },
  { heading: "agents", items: offer(true) },
];

export function Menu({
  x,
  y,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  onPick(choice: Choice): void;
  onClose(): void;
}) {
  const groups: Group[] = GROUPS.map((group) => ({
    heading: group.heading,
    items: group.items.map((item) => ({
      id: item.label,
      label: item.label,
      icon: item.mark === "title" || item.mark === "note" ? <TextMark style={item.mark} /> : <Mark mark={item.mark} />,
    })),
  }));
  const byLabel = new Map(GROUPS.flatMap((g) => g.items).map((item) => [item.label, item]));
  return (
    <Popup
      x={x}
      y={y}
      groups={groups}
      search
      onClose={onClose}
      onPick={(id) => {
        const item = byLabel.get(id);
        if (item) onPick(item.choice);
      }}
    />
  );
}

/** What can be done to a tile that is already there. Short enough not to need searching. */
export function TileMenu({
  x,
  y,
  isText,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  isText: boolean;
  onPick(action: "rename" | "delete"): void;
  onClose(): void;
}) {
  return (
    <Popup
      x={x}
      y={y}
      groups={[
        {
          items: [
            { id: "rename", label: isText ? "edit" : "rename" },
            { id: "delete", label: "delete" },
          ],
        },
      ]}
      onClose={onClose}
      onPick={(id) => onPick(id as "rename" | "delete")}
    />
  );
}

/** The same path data the canvas draws, rendered as SVG for the menu. */
function Mark({ mark }: { mark: readonly Stroke[] }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      {mark.map((stroke) => (
        <path
          key={stroke.d}
          d={stroke.d}
          fill={stroke.width === undefined ? "currentColor" : "none"}
          fillRule="evenodd"
          stroke={stroke.width === undefined ? "none" : "currentColor"}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** A T for a title; stacked lines for a note. The shapes say which is which. */
function TextMark({ style }: { style?: TextStyle }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={
          style === "note"
            ? "M4.5 7h15M4.5 12h15M4.5 17h9"
            : "M5.5 6.4h13M12 6.4v11.2M9.2 17.6h5.6"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth={style === "note" ? 2 : 2.1}
        strokeLinecap="round"
      />
    </svg>
  );
}
