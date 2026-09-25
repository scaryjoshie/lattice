/**
 * Every colour in the application, in one table indexed by role.
 *
 * Two properties make a second theme safe rather than a hunt. First, `Theme` is a type, so
 * a theme missing a role does not compile — completeness is checked rather than
 * remembered. Second, the CSS custom properties are *written from* this table rather than
 * declared beside it, so the canvas and the DOM cannot drift apart: there is one
 * definition, and both read it.
 *
 * Dark is not an inversion. In light, `fill` is darker than `tint` because ink on paper is
 * darker; in dark, an occupied cell is lighter than its surface. The rule "a fill means
 * occupied" survives the flip; "the darker one" would not. That is the argument for naming
 * roles rather than values.
 */

export interface Hue {
  /** Surface of a cell that belongs to a region but holds nothing. */
  tint: string;
  /** Surface of a cell that holds something. */
  fill: string;
  /** The ruling, at this hue. */
  line: string;
  /** Focus, and the lines between agents. Must read against this hue's `fill`. */
  edge: string;
  /** Marks and text. */
  ink: string;
}

/**
 * A terminal's colours. Its background is none: the opened panel's surface shows through,
 * so the terminal and its panel are one surface. The sixteen colours are what programs ask
 * for by number, tuned for each theme so none vanishes into the surface.
 */
export interface TerminalColours {
  foreground: string;
  cursor: string;
  selection: string;
  ansi: readonly [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];
}

export interface Theme {
  name: "light" | "dark";
  terminal: TerminalColours;
  page: string;
  /** How far back everything outside a focus is pushed toward the page. */
  veil: string;
  neutral: Hue;
  hues: readonly Hue[];
  /** A move that would not be legal. The only colour that means "no". */
  warn: string;
  /** The chevrons of a move in flight. Deliberately not one of the hues: it belongs to the
   *  act rather than to anything on the grid. */
  flow: string;
  chrome: {
    surface: string;
    border: string;
    divider: string;
    muted: string;
    hover: string;
    ink: string;
  };
}

export const light: Theme = {
  name: "light",
  terminal: {
    foreground: "#2e2e36",
    cursor: "#3a3a42",
    selection: "rgba(63, 96, 150, 0.2)",
    // black, red, green, yellow, blue, magenta, cyan, white, then the bright eight.
    ansi: ["#3a3a42", "#c24a46", "#3c8255", "#a06a17", "#3f6096", "#7a55b8", "#2c8383", "#8a8d99", "#6f727e", "#d25f5a", "#4e9c70", "#b8801f", "#5b87d4", "#8f6fcf", "#379c9c", "#a2a5b0"],
  },
  page: "#f5f5f6",
  veil: "rgba(245, 245, 246, 0.68)",
  warn: "#c9524e",
  flow: "#d5751f",
  neutral: { tint: "#eeeef1", fill: "#c6c9d2", line: "#ebebef", edge: "#868b9a", ink: "#5f6270" },
  hues: [
    { tint: "#e3ecfb", fill: "#a8c3ee", line: "#cddef8", edge: "#5b87d4", ink: "#3f6096" },
    { tint: "#e0f1e7", fill: "#9fd3b3", line: "#c7e7d3", edge: "#4e9c70", ink: "#3c7455" },
    { tint: "#fce7da", fill: "#f0bd97", line: "#f8d9c4", edge: "#d5813f", ink: "#96603a" },
    { tint: "#ebe3f8", fill: "#c0aceb", line: "#ddd2f6", edge: "#7d5fc0", ink: "#5f4a8e" },
  ],
  chrome: {
    surface: "#ffffff",
    border: "#e4e4e9",
    divider: "#f0f0f3",
    muted: "#a2a5b0",
    hover: "#f2f3f6",
    ink: "#3a3a42",
  },
};

export const dark: Theme = {
  name: "dark",
  terminal: {
    foreground: "#e4e4e8",
    cursor: "#e4e4e8",
    selection: "rgba(255, 255, 255, 0.18)",
    ansi: ["#2a2b33", "#d76b66", "#6fbf8e", "#e0b36a", "#7aa2e8", "#b3a0e2", "#6cc4c4", "#c8cad3", "#71747f", "#e88a85", "#93cfab", "#ecc98c", "#9dbcef", "#c9b8ee", "#93d8d8", "#eeeef2"],
  },
  page: "#131317",
  veil: "rgba(19, 19, 23, 0.68)",
  warn: "#d76b66",
  flow: "#e0913f",
  neutral: { tint: "#1c1c22", fill: "#33343d", line: "#232329", edge: "#71747f", ink: "#a4a7b2" },
  hues: [
    { tint: "#17202e", fill: "#2c4368", line: "#1d2838", edge: "#5f8cd8", ink: "#9dbcef" },
    { tint: "#16241c", fill: "#274a34", line: "#1c2c22", edge: "#4f9f70", ink: "#93cfab" },
    { tint: "#2a1d13", fill: "#5a3a20", line: "#32241a", edge: "#c87f42", ink: "#e0aa7c" },
    { tint: "#221b2e", fill: "#3f3160", line: "#292236", edge: "#8569c6", ink: "#b3a0e2" },
  ],
  chrome: {
    surface: "#1b1b21",
    border: "#2c2c34",
    divider: "#26262d",
    muted: "#74777f",
    hover: "#26262e",
    ink: "#dcdce2",
  },
};

let current: Theme = light;
const listeners = new Set<() => void>();

/** The DOM's colours come from the same table the canvas reads, written onto the root. */
function write(theme: Theme): void {
  const root = document.documentElement.style;
  root.setProperty("--page", theme.page);
  root.setProperty("--ink", theme.chrome.ink);
  root.setProperty("--surface", theme.chrome.surface);
  root.setProperty("--border", theme.chrome.border);
  root.setProperty("--divider", theme.chrome.divider);
  root.setProperty("--muted", theme.chrome.muted);
  root.setProperty("--hover", theme.chrome.hover);
  root.setProperty("--flow", theme.flow);
  root.setProperty("--warn", theme.warn);
  document.documentElement.dataset.theme = theme.name;
}

export const theme = (): Theme => current;

export function setTheme(next: Theme): void {
  current = next;
  write(next);
  for (const listen of listeners) listen();
}

export function onTheme(listen: () => void): () => void {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
}

/** Follow the system until someone says otherwise. */
export function followSystem(): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => setTheme(query.matches ? dark : light);
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}

export const hue = (n: number | null): Hue =>
  n === null ? current.neutral : (current.hues[n % current.hues.length] ?? current.neutral);
