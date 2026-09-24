import { bounds, close, type Grid, indexOfTrack, scopeAt, wellFormed } from "../model/grid.ts";
import { cells as cellsOf, contains, type Region } from "../model/region.ts";
import { invalid, reach } from "../session/react.ts";
import type { Session } from "../session/session.ts";
import type { Camera } from "./geometry.ts";

/**
 * The scene: what is drawn, as a pure function of the grid, the session and the camera.
 * Nothing here is stored. The painter takes this and remembers nothing; the view's hit
 * tests read a few of its fields back, which is why they are on it rather than private.
 */

export interface Cell {
  hue: number | null;
  occupied: boolean;
  /** Which tile owns this cell, so any part of a run can be acted on. */
  tileId?: string;
  /** For a tile larger than one cell, the whole of it. */
  extent?: Region;
}

export interface Plate {
  id: string;
  name: string;
  hue: number;
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

export interface TextRun {
  ci: number;
  ri: number;
  span: number;
  rows: number;
  style: "title" | "note";
  text: string;
  hue: number | null;
}

export interface Occupant {
  ci: number;
  ri: number;
  kind: "claude" | "codex" | "shell" | "browser";
  name?: string;
  hue: number | null;
}

/** The focused occupant and everyone it is talking to. */
export interface Focus {
  ci: number;
  ri: number;
  /** Where the lines leave from. While it is being carried, where it was picked up. */
  anchor: { ci: number; ri: number };
  hue: number | null;
  partners: readonly { ci: number; ri: number }[];
}

export interface Proposal {
  from: Region;
  to: Region;
  hue: number | null;
  ok: boolean;
  swaps: boolean;
}

type Ringed = Region & { hue: number | null };

export interface Scene {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  plates: readonly Plate[];
  cells: ReadonlyMap<string, Cell>;
  occupied: readonly Occupant[];
  texts: readonly TextRun[];
  focus: Focus | null;
  /** What a menu, a rename or an edit is about. Ringed for as long as it is acted on. */
  about: Ringed | null;
  /** The selection, ringed with corner brackets unless a proposal is showing instead. */
  selected: (Ringed & { invalid: boolean; corners: boolean }) | null;
  proposal: Proposal | null;
  hover: readonly [number, number] | null;
  shift: boolean;
  /** The rectangle a shift-click would select right now, or the sweep in progress. */
  extending: (Ringed & { invalid: boolean }) | null;
  handles: readonly { ci: number; ri: number; hue: number; name: string | null }[];
  /** The scope whose handle the pointer is on, ringed whole. */
  pointing: Ringed | null;
  /** The lit gridlines of the selected scope or run, and the pointer for the grip. */
  lines: { region: Region; hue: number | null; c: number | null; r: number | null; cursor: { x: number; y: number } | null } | null;
  /** A resize being proposed: bounds after, the cells made or unmade, whether it may. */
  growing: (Region & { ok: boolean; bands: readonly Region[] }) | null;
  /** For the view's hit tests. */
  selectedScope: string | null;
  resizable: { id: string; region: Region; edgesOnly: boolean } | null;
  tiles: ReadonlyMap<string, Ringed>;
}

export interface View {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  /** The pointer in viewport pixels, so a grip can be drawn under it. */
  cursor: { x: number; y: number } | null;
}

export function sceneOf(grid: Grid, session: Session, view: View): Scene {
  const { selection, overlay, gesture, pointing, shift } = session;
  const editing = overlay?.kind === "edit" ? overlay : null;
  const naming = overlay?.kind === "name" ? overlay.id : null;
  const acting = overlay?.kind === "tile" ? overlay.id : null;

  /*
   * Where things are while a gesture is happening, which is not where the model says.
   * Nothing downstream knows a gesture exists: the cell a tile left is empty, and empty
   * cells already know how to look. Only a legal proposal moves anything.
   */
  const carry = gesture?.kind === "carry" && gesture.verdict?.ok ? gesture : null;
  const stretch = gesture?.kind === "stretch" ? gesture : null;
  const live = carry?.verdict ?? (stretch?.verdict?.ok ? stretch.verdict : null);
  const proposed = new Map(live?.moves.map((m) => [m.id, m]) ?? []);
  const placed = (tile: { id: string; columnId: string; rowId: string }): [number, number] => {
    const m = proposed.get(tile.id);
    return m ? [m.ci, m.ri] : [indexOfTrack(grid.columns, tile.columnId), indexOfTrack(grid.rows, tile.rowId)];
  };
  const placedScope = (scope: Grid["scopes"][number]): Region => {
    const b = bounds(grid, scope);
    const m = proposed.get(scope.id);
    return m ? { ci: m.ci, ri: m.ri, span: m.span ?? b.span, rows: m.rows ?? b.rows } : b;
  };
  // A tile's hue is the scope the model says it is in, never where a proposal would put
  // it. Nothing changes colour because of a move that has not happened.
  const hueAt = (tile: { columnId: string; rowId: string }): number | null =>
    scopeAt(grid, indexOfTrack(grid.columns, tile.columnId), indexOfTrack(grid.rows, tile.rowId))?.hue ?? null;

  const cells = new Map<string, Cell>();
  const plates: Plate[] = [];
  for (const scope of grid.scopes) {
    const b = placedScope(scope);
    plates.push({ id: scope.id, name: scope.name, hue: scope.hue, c0: b.ci, c1: b.ci + b.span - 1, r0: b.ri, r1: b.ri + b.rows - 1 });
    for (const [ci, ri] of cellsOf(b)) cells.set(`${ci},${ri}`, { hue: scope.hue, occupied: false });
  }
  const tiles = new Map<string, Ringed>();
  const occupied: Occupant[] = [];
  const texts: TextRun[] = [];
  const spots = new Map<string, Occupant>();
  for (const tile of grid.tiles) {
    const [ci, ri] = placed(tile);
    const edited = editing?.id === tile.id;
    const extent: Region = { ci, ri, span: edited ? editing!.span : (tile.span ?? 1), rows: edited ? editing!.rows : (tile.rows ?? 1) };
    const hue = hueAt(tile);
    tiles.set(tile.id, { ...extent, hue });
    if (!edited) {
      for (const [c, r] of cellsOf(extent)) {
        cells.set(`${c},${r}`, { hue: cells.get(`${c},${r}`)?.hue ?? null, occupied: true, tileId: tile.id, extent });
      }
    }
    if (tile.kind === "text") {
      // While a run is typed the input draws its glyphs, but its cells stay unruled.
      texts.push({ ...extent, style: tile.style ?? "title", text: edited ? "" : (tile.text ?? ""), hue });
    } else {
      const spot: Occupant = { ci, ri, kind: tile.kind, name: naming === tile.id ? undefined : tile.name, hue };
      occupied.push(spot);
      spots.set(tile.id, spot);
    }
  }
  const byCell = new Map<string, string>();
  for (const [id, spot] of spots) byCell.set(`${spot.ci},${spot.ri}`, id);

  /*
   * Two rings, for two questions. `about` is what a menu, a rename or an edit is about;
   * `selected` is the selection. Separate so a selection stays ringed while a menu is open
   * about something else. Corner brackets say "held"; a proposal in flight says it instead.
   */
  const acted = acting ?? naming ?? editing?.id ?? null;
  const own = selection !== null && "tile" in selection && selection.tile === acted;
  const about: Scene["about"] = acted
    ? own
      ? null
      : (tiles.get(acted) ?? null)
    : overlay?.kind === "add"
      ? { ci: overlay.ci, ri: overlay.ri, span: 1, rows: 1, hue: scopeAt(grid, overlay.ci, overlay.ri)?.hue ?? null }
      : null;
  const corners = !carry && !stretch;
  const selectedScope = selection && "scope" in selection ? grid.scopes.find((s) => s.id === selection.scope) : undefined;
  const selected: Scene["selected"] =
    selection && "tile" in selection
      ? (() => {
          const shape = tiles.get(selection.tile);
          return shape ? { ...shape, invalid: false, corners } : null;
        })()
      : selectedScope
        ? { ...placedScope(selectedScope), hue: selectedScope.hue, invalid: false, corners }
        : selection && "region" in selection
          ? { ...selection.region, hue: scopeAt(grid, selection.region.ci, selection.region.ri)?.hue ?? null, invalid: invalid(grid, selection), corners }
          : null;

  const carrying = gesture?.kind === "carry" ? gesture : null;
  const heldTile = carrying?.id ? grid.tiles.find((x) => x.id === carrying.id) : undefined;
  const proposal: Proposal | null =
    carrying?.command && carrying.verdict
      ? {
          from: carrying.from,
          to: carrying.command.to,
          hue: heldTile ? hueAt(heldTile) : (scopeAt(grid, carrying.from.ci, carrying.from.ri)?.hue ?? null),
          ok: carrying.verdict.ok,
          swaps: carrying.verdict.swaps,
        }
      : null;

  const selectedTile = selection && "tile" in selection ? grid.tiles.find((x) => x.id === selection.tile) : undefined;
  const resizable: Scene["resizable"] = selectedScope
    ? { id: selectedScope.id, region: placedScope(selectedScope), edgesOnly: false }
    : selectedTile?.kind === "text" && tiles.get(selectedTile.id)
      ? { id: selectedTile.id, region: tiles.get(selectedTile.id) as Region, edgesOnly: true }
      : null;

  // Everything about the pointer comes from the one target.
  const cell = pointing?.kind === "cell" ? pointing : null;
  const onHandle = pointing?.kind === "handle" ? pointing.scope : null;
  const line = stretch ? stretch.at : pointing?.kind === "line" ? pointing : null;
  const lines: Scene["lines"] =
    resizable && line ? { region: resizable.region, hue: selected?.hue ?? null, c: line.c, r: line.r, cursor: view.cursor } : null;

  // A scope's handle shows while the pointer is inside it or on it, and goes once the
  // scope is selected: the brackets say it then. Its name shows while the pointer is on it.
  const handles: Scene["handles"] = plates
    .filter((p) => p.id !== selectedScope?.id && (p.id === onHandle || (cell !== null && cell.ci >= p.c0 && cell.ci <= p.c1 && cell.ri >= p.r0 && cell.ri <= p.r1)))
    .map((p) => ({ ci: p.c0, ri: p.r0, hue: p.hue, name: p.id === onHandle ? p.name : null }));
  const hotPlate = onHandle ? plates.find((p) => p.id === onHandle) : undefined;
  const pointedScope: Scene["pointing"] = hotPlate
    ? { ci: hotPlate.c0, ri: hotPlate.r0, span: hotPlate.c1 - hotPlate.c0 + 1, rows: hotPlate.r1 - hotPlate.r0 + 1, hue: hotPlate.hue }
    : null;

  // With something selected, shift previews the rectangle a shift-click would select.
  const swept = gesture?.kind === "sweep" ? gesture.region : null;
  const extending: Scene["extending"] = swept
    ? { ...swept, hue: selected?.hue ?? scopeAt(grid, swept.ci, swept.ri)?.hue ?? null, invalid: !wellFormed(grid, swept) }
    : shift && selected && cell && !proposal && !contains(selected, cell.ci, cell.ri)
      ? (() => {
          const r = close(grid, reach(selected, [cell.ci, cell.ri]));
          return { ...r, hue: selected.hue, invalid: !wellFormed(grid, r) };
        })()
      : null;

  /*
   * Focus: who this one is talking to, from what the pointer is on, or what is being
   * carried, or what a menu or a rename is about. Every occupant focuses, linked or not.
   * A carried occupant's lines stay anchored where it was picked up.
   */
  const subject = carrying?.id ?? acted ?? (selection && "tile" in selection ? selection.tile : null);
  const spot = subject ?? (cell && byCell.get(`${cell.ci},${cell.ri}`));
  let focus: Focus | null = null;
  const here = spot ? spots.get(spot) : undefined;
  if (spot && here) {
    const partners = grid.links
      .filter((l) => l.from === spot || l.to === spot)
      .map((l) => spots.get(l.from === spot ? l.to : l.from))
      .filter((s): s is Occupant => Boolean(s));
    const anchor = carrying?.id === spot ? { ci: carrying.from.ci, ri: carrying.from.ri } : { ci: here.ci, ri: here.ri };
    focus = { ...here, anchor, partners };
  }

  const growing: Scene["growing"] = stretch?.verdict?.after
    ? { ...stretch.verdict.after, ok: stretch.verdict.ok, bands: stretch.verdict.bands }
    : null;

  return {
    camera: view.camera,
    width: view.width,
    height: view.height,
    dpr: view.dpr,
    plates,
    cells,
    occupied,
    texts,
    focus,
    about,
    selected,
    proposal,
    // The hovered cell, unless something already says more about it.
    hover: cell && !extending && !(focus && focus.ci === cell.ci && focus.ri === cell.ri) ? [cell.ci, cell.ri] : null,
    shift,
    extending,
    handles,
    pointing: pointedScope,
    lines,
    growing,
    selectedScope: selectedScope?.id ?? null,
    resizable,
    tiles,
  };
}

/** Whether anything in a scene is animating: crawling dashes, flowing chevrons, a preview. */
export const animating = (scene: Scene): boolean => scene.focus !== null || scene.proposal !== null || scene.extending !== null;

/** The mode the key panel describes: what the grid is in the middle of. */
export type Mode = "idle" | "selected" | "scope" | "invalid" | "moving" | "menu" | "list" | "typing";
export function modeOf(grid: Grid, session: Session): Mode {
  const { overlay, gesture, selection } = session;
  if (overlay?.kind === "edit" || overlay?.kind === "name") return "typing";
  if (overlay?.kind === "add") return "menu";
  if (overlay?.kind === "tile") return "list";
  if ((gesture?.kind === "carry" || gesture?.kind === "stretch") && gesture.command) return "moving";
  if (!selection) return "idle";
  if (invalid(grid, selection)) return "invalid";
  if ("scope" in selection) return "scope";
  if ("tile" in selection && grid.tiles.find((t) => t.id === selection.tile)?.kind === "text") return "scope";
  return "selected";
}
