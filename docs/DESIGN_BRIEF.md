# Design Brief

This brief captures the existing UI system and styling requirements for future work. It was derived from [theme.ts](../src/theme.ts), [global CSS](../src/index.css), [UI preferences](../src/store/uiStore.ts) and the shared components. No rendered accessibility audit has been done yet (ACC-02). Navigation and journeys belong in [App Flow](APP_FLOW.md).

## 1. Product character

ASH Inventory is a practical field and warehouse tool. Screens should make equipment identity, stock, custody, required actions and sync state easy to scan. Use restrained surfaces, clear labels, compact operational lists and explicit status feedback. Provide German and English, light and dark modes, and usable layouts on phones and desktop.

The personal overview puts open work first and then equipment/custody summaries. Staff can choose the team view. Navigation groups follow user tasks rather than backend module names. Keep infrastructure, event transport and implementation details out of ordinary product copy.

## 2. Color system

Use semantic MUI tokens from `theme.ts`, rather than hard-coded colors in feature components.

| Token | Light | Dark | Use |
|---|---|---|---|
| Page | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#f6f7f9;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#f6f7f9` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#111318;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#111318` | App background |
| Paper | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#ffffff;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#ffffff` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#1a1d23;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#1a1d23` | Cards, dialogs, navigation surfaces |
| Subtle | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#f1f3f6;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#f1f3f6` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#22262e;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#22262e` | Table headers and secondary surfaces |
| Selected | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#e8eaf6;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#e8eaf6` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#262c45;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#262c45` | Selected rows/navigation/tabs |
| Border | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#e1e4ea;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#e1e4ea` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#2e333c;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#2e333c` | Dividers and surface borders |
| Input border | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#8a90a0;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#8a90a0` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#6b7280;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#6b7280` | Interactive boundaries |
| Text | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#16181d;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#16181d` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#eef0f3;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#eef0f3` | Primary copy |
| Secondary text | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#5a6170;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#5a6170` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#a9b0bd;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#a9b0bd` | Metadata and secondary labels |
| Primary | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#3949ab;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#3949ab` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#9fa8da;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#9fa8da` | Main actions and selection |
| Strong primary | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#283593;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#283593` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#c5cae9;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#c5cae9` | Emphasized/selected action color |
| On primary | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#ffffff;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#ffffff` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#111318;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#111318` | Primary-button text |
| Success | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#2a6f2e;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#2a6f2e` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#81c784;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#81c784` | Successful completion |
| Warning | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#8a5300;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#8a5300` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#ffb74d;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#ffb74d` | Due soon, stale data, attention |
| Error | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#c62828;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#c62828` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#f28b82;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#f28b82` | Failed commands, blocking problems |
| Info | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#0a5fb4;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#0a5fb4` | <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background-color:#7cb8f0;border:1px solid rgba(128,128,128,0.3);vertical-align:middle;margin-right:4px;"></span> `#7cb8f0` | Informational feedback |

Use text/icons with color so meaning remains apparent without color perception. The theme comments report contrast checks for shell pairings; this is historical implementation evidence, not certification of every screen. Target readable normal text (4.5:1) and interactive boundaries/icons (3:1) in both modes.

## 3. Typography and density

| Element | Current rule |
|---|---|
| Main font | System UI stack: Segoe UI/Roboto/Helvetica/Arial/Noto Sans fallbacks |
| Identifier font | UI monospace/Cascadia Mono/Consolas for SKU, asset, order and document codes |
| Page title (`h4`) | 1.5rem; 1.875rem at 900px and above; weight 600; line-height 1.25 |
| Section title (`h5`) | 1.25rem; weight 600; line-height 1.3 |
| Smaller section title (`h6`) | 1.125rem; weight 600; line-height 1.35 |
| Body | Line-height 1.5 |
| Buttons | Sentence case; weight 600; no uppercase transformation |
| Quantities/tables | Tabular numerals for stable comparison |
| Corner radius | Theme default 8px |

Semantic headings follow page structure: h4 maps to h1; h5/h6 to h2; subtitles to h3 unless a component overrides it appropriately. Allow long names and codes to wrap; do not make identifier length expand the entire page. Routine Paper surfaces are flat, border-led and have no gradient; menus/popovers can retain elevation.

## 4. Responsive shell

- Below MUI `md` (900px), use a temporary drawer and a fixed 64px bottom navigation with safe-area padding. The drawer width is `min(86vw, 320px)`.
- At desktop widths, use a collapsible 256px persistent drawer. Main content adjusts width with the theme transition.
- Main content horizontal padding is 16px on small screens, 24px at md and 32px at lg; vertical padding is 16px/24px. Mobile bottom padding reserves `88px + safe-area-inset-bottom` so actions are not covered.
- Default desktop drawer starts open; phone drawer starts closed. Theme preference is stored in localStorage and defaults to the device color scheme when no preference exists.
- Desktop navigation groups: Overview, Inventory, Orders & returns, Operations, Reports, Administration. Only show permitted entries. Mobile shortcuts are Home, Inventory, Orders, Tasks and More.
- Keep operational tabs scrollable with labelled controls. Operations uses top-level task groups and secondary pill-like section tabs.

Phone controls have a product touch target of 44px. Standard buttons start at 40px and grow to 44px below 600px; icon buttons also gain a 44px minimum. Tabs default to 48px. These are the existing theme rules, not a claim that every custom control satisfies them.

## 5. Shared component vocabulary

| Pattern | Existing components | Styling / behavior requirement |
|---|---|---|
| Screen header | `PageHeader` | One clear title, optional short description, context actions |
| Sections and facts | `DetailSection`, `CompactDetail`, fact lists | Separate identity, stock, ownership and supporting metadata |
| Forms | `FormDialog`, `ClosableDialog`, shared ActionButtons | Label fields, expose validation, preserve keyboard/focus behavior |
| Confirmation | `ConfirmDialog` | Explain the concrete action and consequence |
| Feedback | `StateMessage`, `QueryFeedback`, `AppSnackbar`, Alerts | Distinguish loading, empty, done, error and incomplete/stale states |
| Catalog | Items/Assemblies lists, DataGrid, pagination controls | Scan identifiers and quantities; retain filters and clear completeness |
| Quantity editing | `QuantityInput`, `QuantityControl` | Numeric clarity and usable increment/decrement controls |
| Operational entry | `OperationListEntry`, `OperationLines` | Consistent title/status/action hierarchy |
| Media | `MediaImage`, `ImageAttachments`, `ImageCropDialog` | Crop/preview/order/remove explicitly; handle failed or restricted images |
| Scanning/labels | `CameraScanner`, `QrLabelDialog`, `QRCodeGenerator` | Explain resolved identity before offering a stock action |
| Sharing | `InventorySharing`, `InventoryAccessGroups` | Display owner and view/edit distinctions; show restricted location state |
| Inbox/sync | `ActionInboxContent`, `QueuedActionsDialog`, `SyncIssuesDialog` | Make pending actions, local queue state and correction evidence distinct |

A generalized `DataTable` remains a target alongside server paging (PLAN-03); do not describe it as an existing standard component.

## 6. Content and state presentation

Stock labels must distinguish on hand, checked out, reserved, available, damaged, transit and ordered supply. A purchase on order is not physical transfer stock. Maintenance, contributor damage, lot quarantine and consent restrictions should explain why supply is unavailable.

Queued success means saved to this device. Server acceptance is a different state. Cached data carries its download time; incomplete catalog loads must not look complete. Report snapshots display generation/freshness, and a stale snapshot must not silently appear live.

Preserve actor/time/history visibility for handover and reconciliation. Show current status alongside permitted next actions. Avoid offering private mutations or uploads as offline-capable. A restricted private location needs a meaningful restricted state instead of an empty address that looks like missing data.

## 7. Accessibility, localization and print

The shell includes a keyboard-focus skip link to main content, labelled navigation, active-route `aria-current`, tab/tabpanel associations and dialog affordances. Shared controls provide titles/labels for icon actions. Preserve these patterns when editing screens. Verify focus return, keyboard use, error announcement and camera alternatives in browser acceptance (ACC-02).

Use the existing naming/date/money helpers and locale-aware presentation. German and English resources coexist with inline translation pairs; key-only localization is a target (PLAN-09). Do not assume fixed label lengths. Theme/language controls must stay discoverable on mobile.

Print CSS hides headers, drawers, navigation and `.no-print` elements, and removes main-layout padding. QR labels, order slips and report CSV/PDF exports need independent legibility checks; screen styling alone does not validate exported output (ACC-03).

## 8. Design acceptance checklist

- [ ] Walk catalog, preparation, pickup, return, inbox and sync on phone and desktop in both modes.
- [ ] Confirm no clipped actions, covered content or unreadable long names in German and English.
- [ ] Verify keyboard/focus order, dialogs, screen-reader labels and status announcements.
- [ ] Check contrast and touch targets on rendered custom controls, including maps and quantity editors.
- [ ] Verify stale/offline/conflict/restricted states with realistic data.
- [ ] Inspect printed labels, order PDFs and report exports across supported browsers.

These are pending acceptance tasks, tracked in [Implementation Plan and Progress](IMPLEMENTATION_PLAN.md).
