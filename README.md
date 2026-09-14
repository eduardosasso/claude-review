# claude-review

Shared, reusable Claude Code Review workflow for GitHub Actions.
Runs `claude-code-action` on each pull request, posts inline comments, and
requires a published exact-head verdict before the check can pass.

Call it from a repo's `.github/workflows/claude-code-review.yml`:

```yaml
jobs:
  claude-review:
    uses: eduardosasso/claude-review/.github/workflows/review.yml@v1
    with:
      context: "This repository is a Bun and TypeScript project ..."
    secrets:
      claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

`context` is optional, free-text project notes injected into the review
prompt. `runs_on` (optional, default `self-hosted` + `omarchy`) sets the
runner labels as a JSON array.
