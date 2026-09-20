# Pane design docs

These docs freeze the mental model we converged on before implementation. They are
meant to be edited as the model changes. Every doc is a projection of the same
underlying idea, so if two docs disagree, fix the disagreement rather than picking one.

## Reading order

Start with [core.md](core.md): value propositions, object families, the one tree, the
kernel and the layer model. Everything below assumes it.

| # | Doc | What it covers |
|---|-----|----------------|
| 0 | [thesis.md](00-thesis.md) | What Pane is, what it organizes, the core product bet |
| 1 | [domain-model.md](01-domain-model.md) | Nouns, relationships, operations, provenance, persistence, events |
| 2 | [worktrees-and-git.md](02-worktrees-and-git.md) | Repos vs worktrees, managed filesystem layout, commits as change units, integration |
| 3 | [agents-and-runtime.md](03-agents-and-runtime.md) | Persistent agent identity, provider abstraction, lifecycle, the three V0 agent roles |
| 4 | [communication.md](04-communication.md) | Isolation boundaries, control plane vs data plane, knowledge retrieval vs chat |
| 5 | [ask-mode-and-assistants.md](05-ask-mode-and-assistants.md) | Normal mode vs Ask mode, universal "why?", routing, three levels of answer, assistants |
| 6 | [needs-you.md](06-needs-you.md) | The human attention queue |
| 7 | [ui.md](07-ui.md) | Canvas, sidebar, glance/peek/enter, semantic zoom |
| 8 | [v0-scope.md](08-v0-scope.md) | Build order, what is in, what is deliberately deferred, the hypothesis V0 tests |
| 9 | [decisions.md](09-decisions.md) | Log of decisions we already made, with rationale and alternatives |
| 10 | [open-questions.md](10-open-questions.md) | Things we have not decided and should discuss |
| 11 | [ui-tooling.md](11-ui-tooling.md) | Canvas, terminal and keyboard tooling: what was chosen, what was rejected |

## One-paragraph summary

Pane is a persistent, visual operating environment for parallel software work. Git
worktrees provide isolated execution environments. Agents provide disposable,
restartable compute. Tasks, problems, questions and decisions provide durable
organizational state. The evolved Modelbus is the runtime and communication substrate.
The graph canvas is the primary way humans understand and manipulate all of it, and
Ask mode makes every object interrogable. The point is that work survives chats,
agents, terminals, and individual model contexts.
