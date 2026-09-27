# Settings

What can be set, where each setting lives, and how the panel looks. Decided 24 September
2026 from Joshua's notes. The panel and the app's settings are built; a project's wait for
projects.

## Two scopes, and nothing between them

1. A setting belongs to the app or to a project, never both. The app's hold for every
   project on the machine; a project's hold for that project alone.
2. The rule: a setting is a project's when its value is about something in the project,
   a repo, a path, a worktree, or how that project's work is done. Otherwise it is the
   app's. The default location for new worktrees names a path beside a repo, so it is a
   project's. The theme is about nobody's code, so it is the app's.
3. No setting is inherited or overridden. There is no app default that a project may
   replace, because an override chain is where grey areas come from: a value whose origin
   has to be looked up is a value nobody can predict. If one setting is ever wanted in
   both places, it is two settings with two names, each in one scope.
4. A grey area, when one appears, is a question for Joshua, not a judgement call made in
   code. It means rule 2 is missing a case, and the fix is to the rule.

## What is in it

| Setting | Scope | Why there |
|---|---|---|
| Theme: light, dark, follow the system | App | About the window, not any code |
| The key panel, shown or hidden | App | Same |
| Default location for new worktrees | Project | A path beside that project's repos |
| Each provider: enabled, the command to run | App | Which programs are on this machine |
| The browsers' search engine | App | About no project |

5. A provider's command is found on the path (`which claude`, `which codex`) and can be
   set by hand when it is somewhere else.
6. Lattice runs the providers' own programs and holds no API keys, as
   [organization.md](organization.md) 15 says. Nothing in settings asks for a key.

## Where they are kept

7. The daemon owns them. The app's are in `~/.lattice/preferences.json`, which holds only
   what differs from the defaults, as VS Code's settings.json does, so it can be read and
   edited by hand; an edit reaches every window. A value in it that its setting does not
   take is ignored and the default used.
8. Every setting is defined once, in `packages/protocol/src/preferences.ts`: its default
   and which values it takes. Adding one is an entry in that table and its control in the
   panel; nothing in the daemon or the store changes. A provider with no entry is enabled
   and started by its own name, so the daemon need not know which providers exist.
9. A project's settings, when projects exist, are a second table beside the app's, made of
   the same kinds and stored with the project; `prefer` names the project it changes.

## The panel

10. A modal, opened from a control at the top right of the window and by Cmd-comma.
    Closed by Escape or a click outside, as the open panel is.
11. The same look as the key panel and the menu: semi-transparent, minimal, labels and
    values only. No descriptions under settings, per the rule on UI text.
12. Two sections, App and the current project, so where a setting lives is visible in where
    it is shown.

## Order

13. Done. The panel was built first, against a mock, so its look could be settled while
    nothing else depended on it; the daemon now owns the app's settings and the panel is
    unchanged but for the command field, which keeps a draft and sends it on Enter or when
    it is left. Project settings wait for projects to exist.

## Open

- Which provider settings are the app's and which a project's, beyond the command: extra
  arguments, a default model, environment variables. Each is decided by rule 2 when it is
  added, not in advance.
