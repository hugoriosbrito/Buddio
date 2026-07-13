# Contributing to Buddio

Thanks for helping improve Buddio.

## Development setup

1. Install Bun, Rust (`stable`), and (on Windows) VS Build Tools with the C++ workload.
2. Clone the repo and run:

```bash
bun install
bun run tauri dev
```

## Conventional Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new user-facing capability
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code change that neither fixes a bug nor adds a feature
- `test:` adding or fixing tests
- `chore:` tooling, deps, scaffolding

Examples:

```text
feat: dual output device selection
fix: detect duplicate clips by file hash
```

## Pull requests

- Keep PRs focused and reviewable.
- Include a short summary of *why*.
- For UI changes, describe the manual test path (import → hotkey → play → stop-all).
- Run before opening:

```bash
cargo fmt --check
cargo clippy --workspace -- -D warnings
bun run build
cargo test --workspace
```

## Code of conduct

Be respectful. Assume good intent. No harassment.
