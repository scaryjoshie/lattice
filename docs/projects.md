# Projects, repos and worktrees

What Lattice knows about the code it organises, and how it knows it. Decided 24 September
2026. Not built.

## The rule

Lattice observes git; it does not own it. Which worktrees exist is read from git the way
what runs in a terminal is read from the process: never declared, never stored as a
second copy.

```
project    one grid, a name, a set of repos
repo       identity: the resolved git common directory. A display path and a default
           location for new worktrees
worktree   identity: its entry under the repo's .git/worktrees. Becomes a scope on the
           project's grid
```

## Decided

1. A project is one grid. That is why projects exist: a scope has a position and a
   position is on a grid. Stored in `~/.lattice`, nothing on disk.
2. A repo is a path the user pointed at, anywhere. Lattice runs `git worktree list` and
   every worktree becomes a scope, wherever it lives and whoever made it.
3. Repo identity is the git common directory, found with
   `git rev-parse --path-format=absolute --git-common-dir` (relative otherwise, from the
   main worktree) after resolving symlinks. Every worktree of a repo shares one. Pointing at a second
   worktree of a known repo is a no-op that returns the first. The same repo cannot be
   added twice.
4. Two clones of one remote are two repos. They have separate git directories and
   separate worktrees. The shared remote may be shown; the repos are never merged.
5. A repo is in one project at a time. Adding it to another is a move, confirmed. If that
   is ever wrong in use, projects were the wrong unit and the answer is one larger grid.
6. A linked worktree's identity is its `.git/worktrees/<name>` entry, which survives
   `git worktree move`. A moved worktree keeps its scope, agents and position, and only
   its path changes. The main worktree has no entry and is identified by the common
   directory itself. A name can be reused after a worktree is removed and pruned, so it
   is an identity only while the worktree exists.
7. Creating a worktree from the grid runs the same `git worktree add` the user would, into
   the repo's default location, which the user can change. Default: a sibling directory
   named after the branch. The result is imported like any other worktree; nothing
   distinguishes ours from theirs.
8. Repos with no remote are allowed and cost nothing. Nothing depends on a remote.
9. Folders that are not git repositories are not allowed. A scope is a worktree; a folder
   without git has none, and a second kind of scope is the second containment hierarchy
   [grid.md](grid.md) rejects. `git init` makes it the first case.
10. There is no Lattice project folder. It was proposed and dropped, because git finds
    worktrees wherever they are, so a folder Lattice owns buys nothing.
11. The only things Lattice writes outside `~/.lattice` are worktrees created with an
    ordinary `git worktree add` at a location the user chose or defaulted.
12. Submodules have their own git directories and are not handled.

## Open

- **Adding.** Decided 24 September, from Joshua's notes: a worktree git reports is not put
  on the grid by itself, since where it would go is not defined and the user may not want
  it there. Detected worktrees are listed, and the user drags one onto the grid to add it.
  The list is a sidebar, kept out of the way so the grid is not cluttered; its look is
  open. The default location is only where a worktree created from Lattice goes.
- **Disappearance.** A worktree removed outside Lattice has agents and text in its scope.
  Removed, or greyed and kept until the user acts. The same question as deleting an agent,
  and it wants one answer for both.
- The scope for a first version is repo-based: one repo, its worktrees imported. A project
  as a set of repos changes nothing underneath.
