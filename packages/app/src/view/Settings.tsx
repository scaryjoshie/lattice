import { useEffect, useState } from "react";
import { PROVIDERS, type ProviderId } from "../providers/index.ts";
import { type Engine, ENGINES, providerOf, type Theme, usePreferences } from "../store/preferences.ts";
import { Mark } from "./Menu.tsx";

/**
 * Settings: a modal beside the grid, not in it, since settings are about no place on it.
 * While it is open its backdrop takes the pointer and it takes every key first, so the
 * grid and the camera see nothing. Cmd-comma opens and closes it, Escape or a click
 * outside closes it. Two sections, the app's and the current project's, so where a
 * setting lives is seen in where it is shown (docs/settings.md). Labels and values only.
 */
export function Settings({ open, onToggle, onClose }: { open: boolean; onToggle(): void; onClose(): void }) {
  const preferences = usePreferences((s) => s.preferences);
  const prefer = usePreferences((s) => s.prefer);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
        return;
      }
      if (!open) return;
      // Every key is the modal's while it is open.
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // A field commits on Enter, by losing focus as it does on a click elsewhere. Here,
      // since the field's own key handler is never reached past this one.
      if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.target.blur();
    };
    // Capture, so this runs before the grid's own listener on the window.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onToggle, onClose]);

  return (
    <div className="settings" data-open={open || undefined} onPointerDown={onClose}>
      <div className="settings-panel" onPointerDown={(e) => e.stopPropagation()}>
        <section className="settings-section">
          <h2 className="settings-heading">app</h2>
          <Row label="theme">
            <Choice<Theme> value={preferences.theme} options={["system", "light", "dark"]} onChange={(theme) => void prefer({ theme })} />
          </Row>
          <Row label="key panel">
            <Switch on={preferences.keys} onChange={(keys) => void prefer({ keys })} />
          </Row>
          <Row label="search">
            <Choice<Engine> value={preferences.search} options={Object.keys(ENGINES) as Engine[]} onChange={(search) => void prefer({ search })} />
          </Row>
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
            const provider = providerOf(preferences, id);
            return (
              <Row
                key={id}
                label={
                  <span className="settings-provider">
                    <Mark mark={PROVIDERS[id].mark} />
                    {PROVIDERS[id].label}
                  </span>
                }
              >
                <Field
                  value={provider.command}
                  disabled={!provider.enabled}
                  onCommit={async (command) => providerOf(await prefer({ providers: { [id]: { command } } }), id).command}
                />
                <Switch on={provider.enabled} onChange={(enabled) => void prefer({ providers: { [id]: { enabled } } })} />
              </Row>
            );
          })}
        </section>
        <section className="settings-section">
          <h2 className="settings-heading">project</h2>
          <Row label="new worktrees">
            <input className="settings-field" spellCheck={false} value="../<branch>" readOnly />
          </Row>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <span className="settings-value">{children}</span>
    </div>
  );
}

/**
 * Text the daemon holds, typed into a draft of its own and sent on Enter or when the field
 * is left. Sending every keystroke and showing the echo would drop what was typed while a
 * reply was on its way. Once sent, it shows what the daemon kept, which is the default
 * when the draft was one the setting does not take, such as nothing.
 */
function Field({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit(draft: string): Promise<string> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="settings-field"
      spellCheck={false}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) void onCommit(draft).then(setDraft);
      }}
    />
  );
}

/** One of a few, side by side. */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange(value: T): void }) {
  return (
    <span className="settings-choice">
      {options.map((option) => (
        <button type="button" key={option} data-on={option === value || undefined} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </span>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
  return <button type="button" className="settings-switch" role="switch" aria-checked={on} data-on={on || undefined} onClick={() => onChange(!on)} />;
}
