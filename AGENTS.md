# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
<!-- One or two sentences: what the app does and for whom. Link SPEC.md. -->
ClubEvents is a small web application for a student club. Members browse events and manage their own registrations. Organizers manage their own events and may request an AI writing suggestion.

See `SPEC.md` for goals, non-goals and acceptance criteria.

## Commands
<!-- How to install, run, test. Keep these exact and working. -->
- Install: npm install
- Run: npm start
- Test: npm test
- Coverage: npm run coverage
- Database migrations: npm run db:migrate
- Demonstration data: npm run db:seed
- MCP server: npm run --silent mcp
- MCP check: node mcp-server/check.mjs -- npm run --silent mcp

## Conventions
<!-- Folder layout, naming, where business rules live, how errors are returned to the client. -->
- Use Node.js 22, Express, PostgreSQL, and plain HTML, CSS, and JavaScript.
- Prefer straightforward code and few dependencies over extra frameworks or abstractions.
- HTTP handlers live in src/routes/, business rules in src/services/, and SQL access in src/data/.
- Keep the external model client in src/clients/.
- Browser files live in public/, tests in test/, and numbered SQL migrations in migrations/.
- Every schema change gets a new numbered migration. Never silently modify an applied migration.
- Seed data must be repeatable without duplicate rows. Use future event dates relative to seed creation.
- Seeding must be an explicit operation, not a reset performed on every application start.
- Use harmless demonstration identities. Obtain demonstration passwords through configuration and store only their hashes.
- Return consistent API errors and display readable messages in the interface.
- Preserve the existing MCP server's CommonJS compatibility. Do not break it by changing the repository-wide module configuration.
- Do not edit the course self-check scripts to make a check pass.
- Do not fabricate test outcomes, usage statistics, or the student's manual verification notes.

## Layers
<!-- Fill in the file or folder for each layer. -->
Requests arrive two ways and both end in the same place:

- HTTP route handler → service → data access → database
- MCP tool → **the same service** → data access → database

A route handler reads the request and turns a result into a status code. A service holds the
rules and knows nothing about HTTP or about MCP. Only the data layer writes SQL. An MCP tool
that talks to the database directly is a second, unguarded way into your data: never add one.

## The model feature
<!-- Provider, env var, and the call site. -->
- The provider is named in exactly one file:
- The key comes from an environment variable and is never committed or logged.
- Every call has a timeout and a deterministic fallback, so the app still works when the provider is down or rate-limited.
- The model's output is re-checked against real data before anything is saved or shown.
- Tests never call the provider: they pass in a fake client.

## The MCP server
<!-- Where it lives and how it authenticates. -->
- Lives in `mcp-server/`, grew out of Exercise 1.
- Every tool calls a service function; none touches the data layer or the database directly.
- It carries a user, and enforces exactly the same authorization rules as the HTTP API.
- Adding a tool means adding a row to the table in `SPEC.md` too.

## Tests and coverage
- Every acceptance criterion in `SPEC.md` has an id like `AC-3`, and a test whose title contains that id.
- The coverage gate runs in CI: 100% of the service layer, 80% overall.
- A test is evidence. Changing a test so the code passes destroys the evidence.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data
