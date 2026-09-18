interface Props<T extends string> {
  tabs: readonly T[];
  active: T;
  onChange(tab: T): void;
}

export function Tabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          className={`tab${t === active ? " active" : ""}`}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
