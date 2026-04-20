# Copilot Runtime Guidance

## Architecture

- Keep interface layers thin. CLI entrypoints, route handlers, and React components should delegate to provider services instead of embedding business rules inline.
- Put provider-specific logic under `src/providers/<provider>/`.
- Reuse shared utilities for configuration, permission checks, formatting, and persistence.

## Safety

- Never hardcode tokens or connection details. Use environment variables and document them in `README.md`.
- Treat file writes as mutating operations. Honor `TOKEN_REPORTING_READ_ONLY=true` before writing snapshots or generated artifacts.
- Prefer typed parsing with schemas at API boundaries.

## Testing

- Follow Red → Green → Refactor for new behavior and bug fixes.
- Add or update regression tests before modifying provider behavior.
- Keep tests deterministic by using fixtures or mocked fetch implementations instead of live provider calls.
