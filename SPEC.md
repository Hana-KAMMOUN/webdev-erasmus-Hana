# ClubEvents

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
Club events.

## Goals
- Members can sign in, browse upcoming club events, register when a place is available, and cancel their own registrations.
- Organizers can create and edit their own events and view the members registered for those events.
- Organizers can optionally use AI to suggest a title and a short summary from a description they provide.

## Non-goals
- No payments: all events are free.
- No email notifications or push notifications.
- No separate mobile application: only a mobile-responsive website.
- No messaging between members.
- No comments or event ratings.
- No waiting lists for fully booked events.
- No interface for creating clubs or managing user roles: one club and demonstration accounts are provided through seed data.
- No poster uploads or image recognition: the AI feature accepts text only.

## Constraints
- Use Node.js 22, Express, PostgreSQL, and plain HTML, CSS, and JavaScript.
- Keep the application and the existing MCP server in the same public GitHub repository. Application code lives outside mcp-server/.
- Use a REST API between the browser interface and the backend.
- Use four business entities: users, clubs, events, and registrations. - Registrations implement the many-to-many relationship between users and events. Additional authentication tables are allowed.
- Use numbered migrations for every database schema change.
- Store passwords only as secure salted hashes. Never store readable passwords.
- Keep secrets in environment variables. Never commit real credentials, session tokens, or API keys.
- Put business rules and authorization checks in services. HTTP routes and MCP tools call the same services.
- Prevent duplicate registrations and capacity overruns, including concurrent registration requests.
- Use the existing demonstration accounts for local sign-in. A public email/password account-creation screen is outside this project's scope.
- The final application must be available at a public URL on the day of the defence.
-Keep the implementation small enough to explain every file and business rule.

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
- Model: Gemini 2.5 Flash for text generation, configured through MODEL_NAME. Verify availability before implementing the integration and update this specification if the selected model changes.

- Input: a short event description entered by an organizer, limited to 1,000 characters. Only this description and the instructions needed to generate the suggestion are sent to the provider. Member details, registration lists, passwords, and session tokens are never sent.

- Output: a suggested title of 1-100 characters and a suggested summary of 1-500 characters. Both must be strings containing non-whitespace text. Invalid output is rejected before display. Valid output fills editable fields labelled as an AI suggestion. Nothing is saved until the organizer submits the event form.

- When it fails: a missing key, a provider error, a 429 response, a timeout after 10 seconds, or invalid output displays "AI suggestions are unavailable. Please enter the title and summary manually." Existing form values are preserved, and manual event creation remains available.

- While waiting, show "Generating suggestion..." and disable only the suggestion button. Restore the button after completion or failure.

- Keep the provider call outside HTTP handlers, behind an injectable client used by the suggestion service.

- Tests use a fake client and never contact the real provider. Do not log the submitted description or the provider response.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: users sign in with an email address and password. Passwords are stored as bcrypt hashes. Successful authentication creates a server-side session identified by an HttpOnly cookie. Configure cookie protection appropriately for HTTPS deployment and protect state-changing browser requests against CSRF.

- Provider: Sign in with Google using the server-side authorization-code flow with state and PKCE.

- Linking: store Google's stable account identifier. On later Google sign-ins, use that identifier to find the linked user. Link a previously unlinked Google identity to an existing email account only when Google marks the email as verified. An unverified email must never cause automatic linking. A new Google user receives the member role, never the organizer role.

- Both methods use the same internal users and session mechanism, so linked users keep the same registrations.

- Members manage only their own registrations. Organizers create events for the configured club, edit only their own events, and view attendee lists only for their own events.

- Signing out invalidates the server-side session.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| upcoming_events | Lists future club events with their title, date, location, and available places | Authenticated users |
| --- | --- | --- |
| my_registrations | Lists the events for which the current user has an active registration | The session owner |
| --- | --- | --- |
| register | Registers the current user for an upcoming event, rejecting duplicates and full events | Authenticated members or organizers |
| --- | --- | --- |
| cancel_registration | Cancels a registration owned by the current user and releases its place | The registration owner |
| --- | --- | --- |
| suggest_event_text | Suggests an editable event title and summary from an organizer's short description | Organizers |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
Use plain HTML, CSS, and JavaScript.

The final application has four main screens:

- /login: email/password sign-in and Google sign-in.
- /events: upcoming events, available places, and registration actions.
- /my-registrations: the current user's registrations and cancellation actions.
 - /organizer: the organizer's events, a shared create/edit form, attendee lists, and the optional AI suggestion action.

Only /login and the read-only /events screen are built in slice 1. Do not show unfinished action buttons.

Use shared design tokens for colors, spacing, typography, and border radii.
Support widths of 380, 768, and 1280 pixels without horizontal scrolling.
Handle loading, empty, error, and success states with readable messages.
The main flow must work with the keyboard alone, with visible focus and labelled inputs.
Text contrast must be at least 4.5:1, measured with a contrast checker whose name is recorded in docs/UI.md.
The AI feature must visibly show progress and failure.
Use one light theme; a dark theme is outside the scope.
The detailed UI checklist is maintained in docs/UI.md.

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A signed-in user opening /events sees only events whose start time is in the future, ordered from earliest to latest, with title, date, location, and available places.

- [AC-2] A signed-in user registering for an available upcoming event sees "Registration confirmed", one registration is created, and the number of available places decreases by one.

- [AC-3] A user attempting to register for a full event receives HTTP 409 and sees "This event is full"; no registration is added. If two users request the last place concurrently, exactly one succeeds.

- [AC-4] A user registering twice for the same event receives HTTP 409 and sees "You are already registered"; exactly one registration remains for that user and event.

- [AC-5] A user cancelling their own registration sees "Registration cancelled"; the registration is removed and the place becomes available again. An attempt to cancel another user's registration returns HTTP 403 and leaves that registration unchanged.

- [AC-6] An organizer submitting an event with a non-empty title, a future date, a location, and a positive integer capacity sees the saved event in their organizer screen. A member attempting the same operation receives HTTP 403 and no event is created.

- [AC-7] An organizer can edit their own event and view its attendees. Another user attempting to edit it or read its attendee list receives HTTP 403. Reducing capacity below the current registration count is rejected without changing the event.

- [AC-8] An existing local user signing in through a previously unlinked Google identity with the same verified email reaches the same internal account and registrations without creating another user. An unverified email does not trigger account linking.

- [AC-9] An organizer requesting an AI suggestion sees a progress message and then valid, editable title and summary fields. Invalid output, a missing key, a timeout, or a provider error shows the documented fallback message, preserves existing values, and leaves manual submission available. The suggestion alone creates no event.

- [AC-10] An authenticated user calling the MCP registration or cancellation tool gets the same business-rule result as through HTTP. A full event is refused, another user's registration cannot be cancelled, and a missing or invalid token grants no access.

### Slice 1: sign-in and the upcoming events list
- [AC-11] A visitor opening /events without an application session receives a redirect to /login. A request to GET /api/events without a valid session receives HTTP 401 and no event data.

- [AC-12] A user signing in with a valid seeded account reaches /events and sees the three future seeded events, each with its title, date, location, and available places. Seeded passwords are stored as hashes.

- [AC-13] A user submitting an incorrect password stays on the sign-in screen and sees "Invalid email or password"; no authenticated session is created.

- [AC-14] Deleting one demonstration event directly from the database and reloading /events removes it from the screen. Restoring that row and reloading shows it again.

- [AC-15] A signed-in user reloading /events remains signed in while the session is valid. After signing out, opening /events redirects to /login, and the previous session can no longer read GET /api/events.

- [AC-16] While events load, the user sees "Loading events...". If no upcoming events exist, the user sees "No upcoming events." If loading fails or the response is invalid, the user sees a visible error with a Retry button ("Unable to load events. Please try again." with retry action), and an expired session (401) redirects to /login. Successful loading displays the events.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 |  |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Implemented slice: local sign-in/sign-out, PostgreSQL-backed sessions, protected upcoming-events page, and an authenticated API returning future events in chronological order with available places.
- Verified results: automated authentication and events integration tests passed (2 tests passed, 0 failures), and the existing MCP check passed 12/12. User-confirmed browser checks cover valid/invalid login, protected access, session persistence, logout, event display and ordering, the empty state, event deletion followed by exact restoration, loading state ("Loading events..."), offline error with Retry button, and successful recovery on Retry.
- Criteria: based on the current criterion definitions, AC-1, AC-11, AC-12, AC-13, AC-14, AC-15, and AC-16 (success, empty state, loading, offline error, and Retry) have supporting verification and user confirmation. Handling of invalid API responses and redirection on a 401 response are implemented in the frontend code, but these two browser scenarios have not been separately tested.
- Agent corrections: initial proposals needed corrections for protected HTML routing, safe error responses, CSRF/session handling in tests, cookie extraction, sequential execution of tests sharing a database, and reversible manual-check scripts. The initial MCP launch command also required correction.
- Specification clarification: AC-16 was clarified to distinguish an empty array from a failed or invalid API response, require a visible error with a Retry button, and redirect to /login when the session has expired (401).
- Remaining project scope: registration actions, organizer features, Google sign-in/account linking, the model feature, and the planned ClubEvents MCP tools are not implemented in this slice and remain planned for later development.
