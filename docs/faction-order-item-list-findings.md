# Faction order item list findings

- [x] P3: Remove item thumbnails/icons and category labels from selection list rows; use smaller item names.
- [x] P3: Show remaining availability after selected items and assembly components beside the item name without an Available label or extra After order text. Apply color directly through `sx`: positive values green, negative values warning yellow, and zero neutral.
- [x] P3: Remove the list row's shortage icon and vertically center its stock number, including beside wrapped item names.
- [x] P3: Format the list's availability with item units instead of exposing raw quantity steps.
- [x] P3: Match assembly list rows to items: smaller names, no thumbnails/component counts/shortage icons, and centered stock numbers colored green for positive and warning yellow for negative values.
- [x] P3: Derive remaining assemblies from component stock after all selected items and assemblies, retaining negative balances.
- [x] P3: Simplify item and assembly tiles to one remaining-stock number, remove shortage icons and stock/component labels, and center quantity controls at the bottom of each tile.
- [x] P3: Review step: show the selected-lines count in the summary card beside the requested pickup, with an Edit action; drop the header chip and the footer count.
- [x] P3: Cart-style review rows (faction and general orders, shared `OrderReviewLine`): name with a labelled stock status below ("7 short · 3 in stock", "12 left after order"), pill stepper on the same line whose minus becomes remove at one unit.
- [x] P3: Shortage lines sort first under "Needs attention" (no extra warning banner); search shows only above 10 lines, pagination only above one page; "Add equipment" closes the list; footer has a single "Save draft" button.
- [x] P3: Pill stepper (minus becomes remove at one unit) on the faction selection list and tiles and the general order catalog; separate trash buttons removed.
- [x] P3: Last-year comparison moved into the review list: rows show "2026: n" when it differs, and a "Ordered in 2026, not in this list" group offers "Add again". The comparison alert above the list is gone; last year's items load so their names resolve.
- [x] Checked on the 5173 dev server (mobile and desktop, faction and general orders).
- [x] ESLint, typecheck, translation validation and diff whitespace checks passed. No builds or test suites run.
