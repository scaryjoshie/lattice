interface Props {
  tone?: "default" | "ok" | "warn" | "accent";
  children: string;
}

export function Pill({ tone = "default", children }: Props) {
  return <span className={`pill${tone !== "default" ? ` ${tone}` : ""}`}>{children}</span>;
}

export function statusTone(status: string): Props["tone"] {
  switch (status) {
    case "working":
    case "in_progress":
    case "online":
      return "ok";
    case "merge_ready":
    case "blocked":
      return "warn";
    case "merged":
    case "done":
      return "accent";
    default:
      return "default";
  }
}
