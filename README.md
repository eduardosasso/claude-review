# claude-review

Shared, reusable Claude workflows for GitHub Actions.

- `review.yml` runs `claude-code-action` on each pull request, posts inline
  comments, and requires a published exact-head verdict before the check can
  pass.
- `mention.yml` answers `@claude` in issues, pull request comments, and
  reviews.

Call both from one file, a repo's `.github/workflows/claude-code-review.yml`:

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  pull_request_review:
    types: [submitted]
  issues:
    types: [opened, assigned]

jobs:
  claude-review:
    if: github.event_name == 'pull_request'
    concurrency:
      group: claude-review-${{ github.event.pull_request.number }}
      cancel-in-progress: true
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

  claude:
    if: github.event_name != 'pull_request'
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    uses: eduardosasso/claude-review/.github/workflows/mention.yml@v1
    secrets:
      claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

Each caller job's `permissions` block is required. Without it GitHub grants
the called reusable workflow's job `issues: none, pull-requests: none,
id-token: none` regardless of what the called workflow itself requests, and
the run fails immediately with a `startup_failure`.

The review's `concurrency` sits on its job, not the workflow, so a comment
never cancels a review in progress.

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
