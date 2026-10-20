# User management history

- [x] P1: Restrict history to admins in the API and frontend; render no user management content for other roles.
- [x] P1: Keep `user.changed` audit records when published outbox events expire. Previously deleted records cannot be recovered.
- [x] P2: Show per-user history with timestamp, administrator, before/after roles and factions, and reason; paginate newest first.
- [x] P2: Replace user cards with a table, adjacent name/email columns, distinct role colors, and non-wrapping role chips.
- [x] P2: Search names/emails and filter assigned roles on the server before pagination.
- [x] P2: Match share groups to the table layout on both management/sharing pages: name/owner search, group-type filter, colored type chips, pagination and dialog editing. Membership counts and edit actions respect existing group permissions.
- [x] Verification: frontend static type check, lint on changed TypeScript files, DE/EN translation validation and diff whitespace checks passed. Authorization, pagination and retention paths reviewed in source. No builds or tests (repository instructions).
