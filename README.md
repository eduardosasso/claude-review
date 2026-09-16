# claude-review

Shared, reusable Claude Code Review workflow for GitHub Actions.
Runs `claude-code-action` on each pull request, posts inline comments, and
requires a published exact-head verdict before the check can pass.

Call it from a repo's `.github/workflows/claude-code-review.yml`:

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]

concurrency:
  group: claude-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  claude-review:
    permissions:
      contents: read
      pull-requests: write
      issues: write
      id-token: write
    uses: eduardosasso/claude-review/.github/workflows/review.yml@v1
    with:
      context: "This repository is a Bun and TypeScript project ..."
    secrets:
      claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

The caller job's `permissions` block is required. Without it GitHub grants
the called reusable workflow's job `issues: none, pull-requests: none,
id-token: none` regardless of what `review.yml` itself requests, and the
run fails immediately with a `startup_failure`.

`context` is optional, free-text project notes injected into the review
prompt. `runs_on` (optional, default `self-hosted` + `omarchy`) sets the
runner labels as a JSON array. `allowed_bots` (optional, default
`merv-app,claude,github-actions`) is a comma-separated list of bot accounts
the review action will also treat as pull request authors/pushers.

Draft pull requests are skipped. The caller's `ready_for_review` trigger
runs the review once the pull request leaves draft.

## Requirements

The workflow installs its own `bun` via `setup-bun`; the runner only needs
git, curl, and a Linux runner.
