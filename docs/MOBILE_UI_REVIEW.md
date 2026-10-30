# Mobile UI review (2026-10-30)

Code review of every route below the `md` breakpoint. No screenshots: no backend was running, and building is not allowed here.
Heights are estimated from the `sx` values for a 375 × 667 phone. The app bar (56 px) and bottom bar (64 px) leave about **547 px** for content.
Status: `[ ]` open, `[x]` done, `[~]` decided against (reason given).

## Cross-cutting patterns (fix once, helps every page)

- [~] **C1 Filter stacks.** *Partly done:* `FilterPanel` (`components/shared/FilterPanel.tsx`) and `FilterSheet`/`FilterButton` in `CatalogParts` are used by Transactions, Checked out, Orders and Items. Still open: Events, Attendees, Returns, Users, Print QR.
  On phones, filter rows become one full-width field per line. Reuse the Items pattern (`CatalogSearchBar` + bottom-sheet `FilterSheetActions`): a search field, a `Filters (n)` button, and the active count shown as a badge.
  Affected: Transactions (7 controls, ≈ 400 px), Checked out (3 fields in a Paper, ≈ 190 px), Orders (event type + year + faction chips), Events, Attendees, Returns, Users, Procurement scope, Print QR.
- [~] **C2 Explanatory text.** *Partly done:* on phones, `PageHeader` now shows `description` behind an ⓘ (`InfoTip`). That covers every page passing a description; Maintenance, Asset detail and Asset maintenance hints also moved behind ⓘ. Still open: `OrderStatusGuide`, the Contributor alert, the Timeline alert, the Print QR caption, Users and Sharing groups (custom headers).
  Many pages show their `PageHeader` description or a permanent info `Alert`. On a phone that is 2–4 lines (50–100 px).
  On `xs`, move it behind a tap (ⓘ) next to the title, using a `Tooltip` with `enterTouchDelay={0}` (already done for "event use" in ItemDetail) or a popover.
  Affected: Overview "Hello, name", General orders, Events, Attendees, Timeline (description and info alert), Returns, Procurement, Maintenance (subtitle and overdue hint), Users (Authentik text), Sharing groups, `OrderStatusGuide` on every order detail, Contributor "requests" info alert, Print QR caption.
- [~] **C3 KPI tile grids.** *Partly done:* `StatStrip` (tiles from `sm` up, one scrolling line on phones) is used by Team overview, Procurement, Attendees, Timeline, Assembly detail and Event detail. Still open: the Events summary Papers.
  On phones, 2-column tiles take 120–380 px. Replace them with one compact stat line or a horizontally scrolling strip below `sm`.
  Affected: Team overview `StockMetrics` (5 tiles = 3 rows ≈ 380 px), Procurement (4 tiles ≈ 240 px), Attendees (4), Assembly detail (4, including "Created"), Event detail (3), Events (2 stacked summary Papers ≈ 220 px).
- [~] **C4 Inconsistent page headers.** *Partly done:* `PageHeader` gained `back` (an inline arrow). Moved to it: Transactions, Checked out, Maintenance, Assembly detail. Still open: the rest of the list.
  Some pages build their own `h4` + `mb: 3` instead of using `PageHeader`.
  Affected: Checked out, Transactions, Maintenance, Storage locations, Profile, Users, Sharing groups, Location scan, and the detail pages (Asset, Assembly, Event).
  Unify them on `PageHeader` with phone spacing (`mb: 2`), and put the back arrow inline as an icon (as Assembly detail does) instead of a separate "Back to …" button row (44 px).
- [ ] **C5 Nested padding.** A `Paper p: 2` inside `main px: 2` leaves 311 px of content width (Overview sections, Checked-out filter, order lists, Storage-location detail).
  Use `p: { xs: 1.5 }` or flush outlined lists on `xs`.
- [ ] **C6 DataGrid / pagination on phones.** The grid header (≈ 40 px), footer (≈ 52 px) and fixed row heights cost space.
  Use `CatalogRow` lists plus "Show more", as Items does. Affected: Overview "My equipment" (`Contributor`), Events "Usage over time" (one 130 px column per event, so it scrolls sideways), Checked out (`ListPagination` with a rows-per-page select).
- [x] **C7 Shell duplicates.** The hamburger is hidden below `md`; the drawer opens from "More". (The sync icon is unchanged.)
  The app-bar hamburger and the bottom-bar "More" both open the same drawer. Drop the hamburger on phones; that frees one slot for a top destination.
  Optional: show the sync icon only when the app is not in sync, because a green cloud carries no information.

## P1 – Primary content starts below or near the fold

- [x] **Orders (faction tab).** The first order starts at ≈ 470 px, so only its top edge is visible.
  - Tabs Paper (72 px including margin) sits *above* the page title. Move General/Faction into the header (segmented control or title select).
  - "New list" takes its own row. Use `inlineActions` with an icon button.
  - Event-type toggle and year select take two rows. Combine them into one "Event: LS 2026 ▾" control (C1).
  - The faction status chips wrap over 2–3 rows. Collapse them into one summary line ("5/8 factions submitted ●●●○") that expands on tap.
  - Each order row is ≈ 170 px. Put the status chip on the title line, hide the pickup coordinates on phones, and move "Items & pickup groups" from its own button row into a ⋮ menu.
- [x] **Assembly detail.** The component list (the main content) starts at ≈ 900 px.
  - The full-width image (240 px) comes first. Use a 56 px thumbnail in the header, as ItemDetail does, and tap it to enlarge.
  - Turn the 4 stat tiles into one line ("12 components · 3 available · 450 €"). Drop "Created".
  - Put event use, category, description and sharing in a collapsed "Details" section. Shorten the insufficient-stock alert to a count, with the names behind a tap.
  - The quick-add autocomplete needs at least 250 px and gets its own row. Make it an "Add item" header action.
  - Hide the component list's search/filter bar when there are fewer than about 10 components.
- [x] **Transactions.** The 7 filter controls fill the whole first screen (C1).
- [x] **Maintenance.** The order is wrong for field use: category-interval admin config (≈ 260 px) → schedules → due list → an always-open "Record inspection" form.
  - Show due/overdue first. Move the category config into a settings dialog or a collapsed accordion.
  - Open the record form as a dialog from "Inspect now" or a header action.
  - Due cards stack the button under the text on `xs` (≈ 110 px per card). Make the action a trailing icon button.
- [x] **Asset detail.** It still uses the old spacing (`mb 2/3`, `gap 3`, `p 3`, `h4`). The 11 info rows are one column with dividers, ≈ 550 px before the usage history.
  - Switch to the `DetailPanel`/`FieldGrid` layout from ItemDetail (2 columns) and hide empty fields (manufacturer/purchase "—").
  - Move purchase price, replacement value and the registration date into a collapsed details section.
  - Drop the usage-history explanation paragraph. Hide "Reported damage" when there are none, or reduce it to a single line.

## P2 – Cluttered, but the main content is reachable

- [ ] **Item detail.** The header is already compact. The rest is long.
  - Stock: 10–13 single-column metric rows (≈ 330 px), mostly zeros. Show Available / Total / Checked out in one line. Show the other values only when they are non-zero, or put them behind "More".
  - Overview: about 17 fields, several of them redundant on a phone:
    - the item ID (UUID)
    - "Visibility" (already a chip in the header)
    - the "Organization owned" count (equals Total)
    - "Owner/provider" (repeats the Ownership panel)
    - "Created" and the tracking mode (secondary)
  - History: a 210 px chart and an **unbounded** transaction list. Show the last 5 transactions plus "Show all", and collapse the chart.
  - Images: each image is 160 px tall at full width, stacked. Use a horizontal strip, or the header thumbnail opening a gallery.
  - Make secondary panels collapsible on phones (the `DetailSection` accordion already exists). Keep Stock open and collapse Overview, Ownership and History.
- [ ] **Overview (dashboard).**
  - Remove the "Hello, name" description (C2).
  - Manager scope toggle: inline it with the title, or move it to ⋮.
  - Remove the "Open inbox" button on phones; it duplicates the Tasks icon in the top bar.
  - "My equipment" shows 4 tabs with long labels, a search field, an info alert and a DataGrid (C6). Hide tabs with a 0 count, and show search only when there are more than about 8 rows.
  - Team scope: the 5 stat tiles (C3) push the recent transactions off screen.
- [ ] **Faction order detail.**
  - Collapse `OrderStatusGuide` (shown on every load) into an ⓘ next to the status chip.
  - The pickup map is 240 px plus a heading row. On phones, collapse it to "Show pickup point / Open in Maps".
  - The meta line (code · date · lines · units · requested pickup · location) wraps to 3–4 lines. Keep code, date and pickup, and put the rest in the progress panel.
- [ ] **Events.**
  - Remove the description (C2). The Create button takes its own row.
  - The event-type toggle (`mb 3`) and event select, plus the edit/close/items action row, take 3 rows.
  - The two summary Papers become one stat line (C3).
  - Usage over time: explanation, search and a wide DataGrid. Collapse it on phones, or show only the last 2–3 events.
  - History table: three text actions per row (collapses to ⋮). Use list rows with ⋮.
- [ ] **Event attendees.** Description → event-select Paper → 4 tiles → catering rates → filter Paper (search, role, and add buttons stacked) → table. Apply C1, C2 and C3, and move "Add attendee" into the header.
- [ ] **Storage locations (detail on phone).**
  - The back button takes its own row. The sharing card sits *above* the location header.
  - Drop the 32 px icon on `xs`. The 5 actions collapse into the overflow menu, which is fine.
  - The map is 240 px and always shown; collapse it on phones.
  - Child chips wrap without limit. Show "N storage places ▸" collapsed, or a horizontal strip.
  - The list Paper is `p: 2` inside the page padding (C5). The two tab labels are long ("Responsibility & missing information"); shorten them on `xs`.
- [ ] **Procurement.** C2 description, C3 tiles, and the event-scope select (`minWidth 260`, `mb 3`) on its own row. Put the scope into the header or a filter sheet.
- [ ] **Damage reports.**
  - Mobile cards (`p: 2`) are ≈ 220 px.
  - The status chip on its own line is redundant in the "Open" tab, and "Handled by: —" is always empty there.
  - Use compact rows: target + severity, one meta line (date · reporter), and actions in ⋮.
- [ ] **Checked out.** `h4 mb 3` plus the filter Paper (C1). Replace `ListPagination` with "Show more" (C6).
- [ ] **Warehouse tasks (Operations).** Two tab levels (group tabs + pill tabs, ≈ 120 px) on phones. Combine them into one "Area › Section" select, or keep only the pills with the group as their heading.

## P3 – Minor or rarely used on phones

- [~] **Event detail.** *Partly done:* stat strip, and the Notes panel is hidden when empty. Back row; 3 header actions (Attendees, Timeline, Edit items) → 1 primary action plus ⋮; 3 tiles (C3); hide the "Notes" Paper when it is empty.
- [ ] **Event timeline.** Description, then an info alert, then the tabs Paper (C2).
- [ ] **Returns.** Remove the 3-line description (C2). Search and status take 2 rows (C1).
- [ ] **General orders.** Description, and a read-only `Alert` for non-editors (C2). The search field is stacked under the event filter.
- [ ] **Location scan.** The page is reached by scanning, so the QR `CodeLabel` at the bottom is of little use on a phone. Collapse or hide it on `xs`.
- [ ] **Print QR.** The filter Paper has a "Filter" subtitle, a 5-segment toggle that scrolls, a size select and a caption. Its use on phones is doubtful; consider hiding it from mobile navigation.
- [ ] **Users / Sharing groups.** C2 descriptions, C1 filters, C4 headers.
- [ ] **Profile.** Fine overall. Optionally drop the 8 px colour bar and the overline labels on `xs`.
- [ ] **Items / Assemblies.** Already compact, list from ≈ 185 px.
  - Optional: the "active filters · Clear" row (44 px) duplicates the badge on the Filters button; put Clear into the sheet.
  - Optional: move CSV import into ⋮ on phones.

## Done 2026-10-30

- Orders: the General/Factions switch moved from a tab Paper into the filter row, and the title is now "Orders".
  - Event type and year sit behind one summary button on phones (desktop keeps the inline controls).
  - Faction status is a one-line summary with dots that expands on tap.
  - Order rows: status on the title line, pickup coordinates only when no location exists, requested pickup and location on one line, "Items & pickup groups" in ⋮ on phones.
- Assembly detail: header with back arrow, collapsed actions and an "Add item" action on phones.
  - The image is a thumbnail that opens full size. Stats are a strip, and "Created" moved into Details.
  - Details (category, event use, description, sharing) are collapsed on phones.
  - On phones the stock alert shows only the count.
  - The component search appears only from 10 components (`ItemsList searchFrom`).
- Maintenance: header actions "Interval per category" (dialog) and "Record inspection" (dialog, full screen on phones).
  - The due list comes first. Due entries keep the inspect action on their row, as an icon on phones.
  - Per-item schedules are collapsed on phones (`DetailSection`).
- Asset detail: compact `DetailPanel`/`FieldGrid` layout like Item detail.
  - Back link shows the item name, and the open-damage count is in the header.
  - Empty purchase fields are hidden, and the panel actions collapse.
  - Usage history shows 10 entries plus "Show more".
  - The damage section is hidden when there are no reports. Asset maintenance is a `DetailPanel`.
- Found during the work: `MobileNavigationCard` failed `check:i18n` (options object). Fixed.
- Verified: `tsc -b` clean and `check-translations` OK.
  - A temporary fixture preview (Vite + headless Firefox) was checked at 375 px for Orders (both kinds), Assembly, Asset, Maintenance, Transactions and Team overview.
  - Desktop (1280 px) was checked for Orders and Assembly. The preview files were removed.

## Suggested order

1. C1 + C2 + C3: shared components (`PageHeader` info slot, a reusable filter sheet, a stat strip), adopted page by page.
2. P1 pages: Orders, Assembly detail, Transactions, Maintenance, Asset detail.
3. P2 pages, then P3.
