# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->

## 2026-10-16 · MCP tool test with precise description
- Goal: Test whether Gemini CLI can automatically select and use the `find_lecture` MCP tool with its original precise description.
- Delegated: Asked Gemini: `What does lecture 7 cover?` without mentioning the tool name.
- Checkpoints: Verified `/mcp` showed `my-project` as Ready with 2 tools. Gemini selected `find_lecture`, made 1 successful tool call, and the session showed a 100% success rate.
- Went wrong: No MCP error occurred during this session.
- Changed by hand: No server logic was changed. I only recorded the result and the session statistics.

## 2026-10-16 · MCP description experiment
- Goal: Test whether changing only the description of the `find_lecture` tool affects Gemini's tool selection.
- Delegated: Changed the `find_lecture` description to a more generic one, then asked Gemini the exact same question: `What does lecture 7 cover?`
- Checkpoints: Gemini still selected `find_lecture`, made 1 successful tool call, and the session showed a 100% success rate.
- Went wrong: No MCP error occurred. The change in description did not affect the tool selected for this question.
- Changed by hand: I temporarily changed only the `find_lecture` description for the experiment, then restored the original precise description after the test.

## 2026-10-28 · Verify agent instructions
- Goal: Verify that Gemini receives the instructions from AGENTS.md.
- Delegated: Asked Gemini to quote the Always ask before list and provide the exact Install, Run, and Test commands.
- Checkpoints: Compared all nine rules and the three commands with AGENTS.md. The session statistics reported zero tool calls.
- Went wrong: No mismatch was observed.
- Changed by hand: Added this log entry and recorded the session statistics in USAGE.md.

## 2026-11-01 · Checkpoint 2 sign-in and session verification
- Goal: Verify local sign-in, session maintenance, logout, and protected route redirection.
- Delegated: Gemini implemented local authentication and ran automated checks. The user performed the manual browser verification.
- Checkpoints: Automated checks: `npm test` passed successfully, and MCP check passed 12/12. User-reported manual results: invalid credentials showed the expected error, valid login opened /events, reloading preserved the session, logout returned to /login, and reopening /events after logout redirected to /login.
- Went wrong: The initial MCP check used an incorrect launch command and timed out. After correcting the command to `node mcp-server/check.mjs -- npm run --silent mcp`, all 12 checks passed.
- Changed by hand: None

## 2026-11-01 · Checkpoint 3 upcoming events and manual browser checks
- Goal: Display upcoming events from PostgreSQL on the protected events page, implement data and service layers, API endpoint, frontend view, tests, and perform manual browser verifications (upcoming events list, empty state, deletion/restoration, loading state, offline error, and Retry recovery).
- Delegated: Gemini implemented data layer (`src/data/events.js`), service layer (`src/services/events.js`), `GET /api/events` endpoint in `src/app.js`, frontend rendering in `src/views/events.html`, and integration tests in `test/events.test.js`. Gemini also created robust reversible script tools for database backups, empty-state testing, event deletion, restoration, and timestamp precision verification.
- Checkpoints: Automated checks: `npm test` passed successfully (2 tests passed, 0 failures), and MCP check passed 12/12. User-confirmed manual browser results: event display, chronological order, required information, reload, login/logout protection, narrow-screen layout, keyboard navigation, empty state ("No upcoming events."), event deletion/restoration, loading state ("Loading events..."), offline error with Retry button, and successful recovery on Retry. Handling of invalid API responses and redirection on a 401 response are implemented in the frontend code, but these two browser scenarios have not been separately tested.
- Went wrong: Initial test runner execution failed due to stopped PostgreSQL Docker container (`ECONNREFUSED 127.0.0.1:5432`). Started `clubevents-postgres` container via Docker without modifying services, and tests passed successfully.
- Changed by hand: None