# Issue tracker

This repository keeps specs as Markdown files in [`docs/specs/`](../specs/), not as GitHub issues, because the repository is public.

- Write each spec to `docs/specs/<feature>.md` and commit it on the current branch.
- Put a status line under the title. Use `Status: ready-for-agent` for a spec an agent can build without more input.

Tickets stay on the developer's machine:

- Write one file per ticket to `.scratch/<feature>/issues/<NN>-<slug>.md`, numbered in dependency order, blockers first. `.scratch/` is gitignored.
- Each ticket lists what it's blocked by and carries `**Status:** ready-for-agent`.
- A ticket may include constraints that must stay out of the public repository.
