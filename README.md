# Clawpit

Desktop app (Tauri v2 + React + TypeScript) for OpenClaw setup and management.

[![CI/CD](https://github.com/clawpit/clawpit/actions/workflows/ci.yml/badge.svg)](https://github.com/clawpit/clawpit/actions/workflows/ci.yml)
[![Releases](https://img.shields.io/github/v/release/clawpit/clawpit?label=release)](https://github.com/clawpit/clawpit/releases)

## CI and Releases

The GitHub Actions pipeline does the following:

1. On `pull_request` and `push` to `main`/`master`:
   - `bun run typecheck`
   - `bun run check`
   - `cargo check --locked`
   - `cargo test --locked`
   - `bun run test` (when a `test` script exists in `package.json`)
   - `bun run build`
   - uploads frontend artifact (`dist`)

2. On `push` to `main`/`master`:
   - runs `semantic-release` to analyze conventional commits
   - automatically updates:
     - `CHANGELOG.md`
     - `package.json`
     - `src-tauri/tauri.conf.json`
     - `src-tauri/Cargo.toml`
   - creates tag and GitHub Release automatically (when a release is needed)
   - builds and publishes binaries for:
     - macOS
     - Windows
     - Linux
   - uploads packages to the Release created by semantic-release
   - uploads bundles as workflow artifacts as well

## Versioning Strategy

Versioning is based on **Conventional Commits + semantic-release**.

You do not need to bump versions manually or create tags by hand.

Bump rules:

- `fix:` -> patch
- `feat:` -> minor
- `feat!:` or `BREAKING CHANGE:` -> major

## Commit Message Enforcement

Conventional Commits are enforced using **Husky + Commitlint** in two layers:

1. Local git hook (`commit-msg`):
   - Managed by Husky.
   - Installed automatically via `bun install` (`prepare` script).
   - Runs Commitlint before a commit is created.

2. CI enforcement:
   - The `verify` job runs Commitlint on the commit range for every PR/push.
   - If a non-conventional commit is present, the workflow fails.

Allowed commit types:

- `build`
- `chore`
- `ci`
- `docs`
- `feat`
- `fix`
- `perf`
- `refactor`
- `revert`
- `style`
- `test`

Format:

```text
<type>(optional-scope)!: <description>
```

Examples:

```text
feat(setup): add WSL health check card
fix(instances): avoid duplicate status polling
chore(ci): enforce conventional commit messages
```

If hooks are not active locally, run:

```bash
bun run prepare
```

## Release via Command Line

Prerequisites:

- `GH_TOKEN` (or `GITHUB_TOKEN`) with `repo` permissions
- local branch synced with `main`/`master`

Commands:

```bash
bun run release:dry  # simulation
bun run release      # actual release
```

When running release, semantic-release will:

1. calculate the next version
2. update changelog and version files
3. create a release commit
4. create tag `vX.Y.Z`
5. publish the GitHub Release

## Useful Links

- Workflow: [CI/CD](https://github.com/clawpit/clawpit/actions/workflows/ci.yml)
- Runs: [Actions](https://github.com/clawpit/clawpit/actions)
- Published binaries: [Releases](https://github.com/clawpit/clawpit/releases)
