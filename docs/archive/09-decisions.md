# 9. Decisions log

Decisions we already made in design discussion, recorded the way Pane itself would
record them: what, why, alternatives. Add new ones at the bottom. Reopen by adding a
note, not by deleting.

| ID | Decision | Why | Alternatives considered |
|----|----------|-----|-------------------------|
| D-1 | Organize around the **project**, not agents | Agents are workers; the durable center is goals/tasks/problems/worktrees | Agent-centric UI |
| D-2 | Project ≠ Repository; a project spans repos | Real work spans backend/frontend/SDK | Project = repo |
| D-3 | Worktrees are the primary unit of parallel implementation, each with an objective | Isolation without constant sync; maps to a visual box | Branches only; per-agent sandboxes |
| D-4 | Flat worktrees in V0; schema keeps `parent_worktree_id` nullable | Nesting needs checkpointing, parent-child merge semantics, update propagation; observe flat usage first | Recursive from day one |
| D-5 | Tasks are a DAG (`Task` + `TaskDependency`), list and graph are views | Structured enough to reason about, still editable by humans and agents | Markdown todo list |
| D-6 | Problems are a distinct type from Tasks | Discovered vs intended; enables provenance queries | Problems as tagged tasks |
| D-7 | Task ↔ Problem is many-to-many via `object_relations`, never parent/child | One problem → many tasks; one task → many problems; tasks discover problems | Problem as parent container |
| D-8 | Typed persistent items (Task, Problem, Question, Decision) sharing identity/provenance machinery | Proper types, common plumbing | One untyped Item table |
| D-9 | `discovered_in` and `owned_by_scope` are separate facts on a problem | Escalation changes ownership without lying about origin | Single scope field |
| D-10 | Escalation is a scope/ownership change, not a prose message through managers | Durable state beats chat | Manager relays |
| D-11 | Agents are persistent logical identities; process/session is beneath | Survive restart, reconnect, app restart | Agent = process |
| D-12 | Drop `AgentRun` as a domain concept; lifecycle is events | Not user-visible actors | AgentRun table |
| D-13 | Location (observed) and assignment (organizational) are distinct on agents | Both useful; mismatch is signal; cwd change ≠ new agent | Single "worktree" field |
| D-14 | Provider abstraction (`AgentBackend`) beneath Pane; Modelbus evolves into the runtime | Claude/Codex/OpenCode swap freely | Pane → external Modelbus |
| D-15 | Fork creates a new persistent agent; restart keeps identity | Addressing and provenance | Fork as restart |
| D-16 | Worktrees are isolation boundaries; cross-worktree chat is exceptional; semantic state is the normal interface | Worktrees exist to avoid sync | Free agent chat |
| D-17 | Control plane may choose who talks; data plane delivers original text unchanged | No semantic mangling by intermediaries | Manager rewriting messages |
| D-18 | Assistants (knowledge layer) are distinct from coding agents (execution) | Cleaner roles; no interrupting workers to answer "why" | Coding agents answer routing questions |
| D-19 | Assistants are logical, instantiated on demand over scope state | No permanently running manager LLMs | Persistent manager processes |
| D-20 | Routing belongs to assistants/routing agents, not coding agents | Save coding-agent tokens; keep them focused | Agents self-route |
| D-21 | Normal mode + Ask mode; Ask = natural-language ops over selected typed objects | Selection gives scope for free; conversational without being a chat app | Global chatbot panel |
| D-22 | Three levels of answer (recorded / responsible actor / reconstructed), always labeled | Prevents fake institutional memory | Unlabeled LLM answers |
| D-23 | Explanations are promotable to Decisions ("Save as rationale") | Institutional memory from normal work | Separate docs process |
| D-24 | Multi-agent answers preserve each response; synthesis only in presentation | Sources visible | Hidden synthesis in the path |
| D-25 | Knowledge resolution starts at local scope and expands outward | Scope is for knowledge, not just permissions | Always project-wide |
| D-26 | Commits are the canonical change unit; drop separate "semantic diff" artifact; Pane explains and links commits | Git already has the checkpoint; the gap is bad messages | Continuously maintained semantic diff |
| D-27 | Commits are **not typed** | Free-form, plug-and-play Git | FeatureCommit / BugFixCommit |
| D-28 | Encourage checkpoint commits (task done, handoff, before risky ops) | History, restore, replacement, merge reasoning | Fewer big commits |
| D-29 | Pane-managed filesystem layout (`~/Pane/projects/...`, `~/.pane/repos/`) preferred; adopted repos supported | Visual object = filesystem object; sanity at 5–10 workspaces | User-managed paths only |
| D-30 | One backing repo with Git worktrees, not independent clones | Shared objects, clean layout | Multiple clones |
| D-31 | Merge/integration is first class; LLM integration agent at merge time | Reconcile at integration, not continuously | Continuous sync |
| D-32 | Relational core (SQLite) with explicit graph semantics; no graph DB initially | Graph is highly structured; model > store | Memgraph from day one |
| D-33 | READ = SQL, WRITE = typed commands, OBSERVE = typed events; no PaneQL yet | Don't invent syntax before usage | Custom query language |
| D-34 | Events exist from day one with actor/time/target/cause/payload | "why?" depends on history | Add later |
| D-35 | Stable domain vocabulary (nouns, relations, ops) is the shared language across UI/assistant/runtime/CLI | Consistency | Ad-hoc per layer |
| D-36 | Authority levels for truth: Pane-known > agent-declared > inferred (with confidence) > raw transcript | Don't dump every transcript into one context | Flat context stuffing |
| D-37 | V0: coding agent stewards its own worktree's tasks/problems/decisions/plan | Richest local context; tests the core hypothesis | Separate planning/manager agent |
| D-38 | V0: exactly three agent roles (coding, routing, summarization) | Avoid agent-framework research project | Manager hierarchy |
| D-39 | Authority asymmetry: broad inside own worktree, restricted outside | Prevent one agent reorganizing the project | Uniform permissions |
| D-40 | Attention requests are a distinct type (`AttentionRequest`), not human-assigned tasks | Different semantics: kind, blocking, resolution | Human todos |
| D-41 | Two queues: machine-work and human-attention | Agents don't interrupt; humans get one inbox | Interrupt-driven |
| D-42 | Pane account separate from provider auth; local-first | Metadata sync without owning source | Cloud-required |
| D-43 | Data first: core domain before UI-specific state; model only concepts with concrete use cases | Avoid state living in React nodes; avoid universal ontology | UI-first; big ontology |
| D-44 | Canvas is a projection of state, never the state | Multiple interfaces over one domain | React Flow node data as truth |
| D-45 | **Cmd is the application layer; every other key belongs to the focused TUI** *(narrowed by D-48)* | macOS never encodes Cmd into a control sequence, so no terminal app can bind it. Escape is unusable: Claude Code uses it for interrupt and Esc-Esc for rewind, Codex likewise. Implemented with xterm's `attachCustomKeyEventHandler`, returning `false` on `metaKey` so the event reaches the app untouched | Escape or double-Escape to exit; tmux-style prefix key (`Ctrl-b`), which exists only because tmux has no application layer to hide in |
| D-46 | **Entering a pane expands the pane, it does not move the camera** | Flying the camera moves the whole world to reach one object; expansion leaves the canvas where it is and makes the pane the thing you are looking at. The `enter` step of glance/peek/enter, done as a shared-element transition from the pane's measured on-screen rect | Camera fly-in with `setCenter` at 1:1 (built first, rejected on feel); a plain modal, which discards where the pane was |
| D-47 | **A pane takes the grid of the space it is opened into; the process is resized to match** | A TUI clips unless the grid it believes it has is the grid on screen. Reversing D-46-era "fixed 120x36, never reflow": that rule was written to protect shrunken live terminals on the canvas, which the design no longer has, so it protected nothing and cost clipped rows. Attach order is resize, snapshot, subscribe, against a server-side `@xterm/headless` mirror | Fixed grid scaled by CSS transform (softens text); fixed grid with letterboxing (wastes the screen); raw scrollback replay (wrong whenever the grid changed) |
| D-48 | **The application claims a named list of Cmd chords; every other chord is translated and forwarded to the TUI** | Narrows D-45, which was too absolute. On a Mac, Cmd is not only the application layer, it is also where text editing lives, so swallowing every Cmd chord silently broke Cmd+Backspace, Cmd+Left and Cmd+Right. Clipboard chords stay with the browser, since xterm handles those through native events, not keydown. Shift+Enter needs `ESC CR`, which nothing produces on its own because xterm has no CSI u support | Claiming all of Cmd (what D-45 said, and what broke); claiming none of it and using a tmux-style prefix, which takes a key away from the TUI |
| D-49 | **One screen size; a pane on the canvas is that screen drawn smaller, and opening it animates scale alone** | Animating width and height relayouts the terminal every frame, so opening reads as a box growing and then a terminal arriving, and closing destroys what is being read mid-flight. Scaling keeps one layout, one grid, one rasterisation, and looks like moving closer. Chrome scales with it deliberately | Animating the box and mounting the terminal on arrival (built first, rejected on feel); compensating border and radius to hold constant apparent weight, which reintroduces the look of a resize |

| D-50 | **A pane has the screen's aspect ratio, not its own** | Falls out of D-49: a pane is a view of the screen, so it has the screen's shape. Pane height is derived from window shape rather than chosen | A fixed card shape, which requires cropping the screen rather than scaling it, making opening a scale *and* a reveal. Deferred, not rejected |
