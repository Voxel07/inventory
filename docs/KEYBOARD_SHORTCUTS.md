# Keyboard Shortcuts

The app can be driven from the keyboard: jump to search, move through results, open items, and switch between main areas. Press `?` at any time to see the same list in the app.

Implementation: [KeyboardShortcuts.tsx](../src/components/shared/KeyboardShortcuts.tsx), mounted once in [App.tsx](../src/App.tsx).

## 1. Shortcut reference

| Keys | Action |
| --- | --- |
| `/` or `Ctrl K` | Focus the search field of the current page and select its text. |
| `↓` (in search) | Move from the search field into the results. |
| `Enter` (in search) | Open the first result, if the search field has text and is not inside a form. |
| `↑` / `↓` or `j` / `k` | Move between results. `↑` on the first result returns to the search field. |
| `Enter` (on a result) | Open the focused result. Browser link behaviour applies, so `Ctrl`/`Cmd`+click opens a new tab. |
| `Enter` (on a data grid cell) | Open the row's link. |
| `Esc` (in search) | Leave the search field. |
| `Backspace` | Go back. Without in-app history, go up one level in the URL instead of leaving the app. |
| `g` then `h` | Home (`/`). |
| `g` then `i` | Items (`/items`). |
| `g` then `a` | Assemblies (`/assemblies`). |
| `g` then `l` | Storage locations (`/storage-locations`). |
| `g` then `o` | Orders (`/orders`). |
| `g` then `e` | Event planning (`/events`). |
| `g` then `t` | Event attendees (`/events/attendees`). |
| `g` then `p` | Profile (`/profile`). |
| `?` | Show the shortcut overview. |

Press the two keys of a `g` shortcut one after the other. The second key must follow within about 1.2 seconds.

## 2. When shortcuts are active

- Shortcuts are inactive while typing in a text field, text area, dropdown or other editable element. The exceptions are the search field, where the search-specific keys above apply, and `Ctrl K`, which works from any field.
- Shortcuts are inactive while a dialog, menu or popover is open.
- Modifier combinations (`Ctrl`, `Cmd`, `Alt`) are ignored, except `Ctrl K` / `Cmd K`.
- Keystrokes arriving faster than about 65 ms apart are treated as barcode scanner input and are ignored by the shortcut handler. The scanner feature handles them.

## 3. Which search is used

The page search is found automatically:

1. A visible `type="search"` input inside the main content.
2. Otherwise, a visible text input whose label, placeholder or accessible name contains "search" or "such" (German).

A page without either has no search target, and `/` and `Ctrl K` do nothing there.

Results are the visible links inside rows, cards or list items that come after the search field in reading order. Each row counts once, using its first link.

## 4. Known limits

- Only Backspace is handled by the app; the browser's own back shortcut (`Alt ←`) still works but is not part of the shortcut handler.
- Shortcuts depend on the page markup. A new list that is not a table, card or list, or that has no visible links, will not be reachable with `↓` / `j`.
