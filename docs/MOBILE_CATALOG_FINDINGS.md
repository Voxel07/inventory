# Mobile catalog layout

- [x] P2: Items and assemblies placed stock below the name. Updated their shared `CatalogRow` to keep stock on the name row, prevent stock wrapping or shrinking, and truncate overflowing names with an ellipsis.
- [x] Reviewed both compact list callers and retained secondary quantity details below the main row.
- [x] Checked the diff for whitespace errors. No builds or test suites run.
- [x] Started Vite at `http://127.0.0.1:5173/` and verified the actual list components in a temporary preview with sample data (normal app requires Authentik).
- [x] Browser checks at 320px, 375px and 430px: stock remains beside names, long names truncate, secondary quantities remain below, and menus stay visible. Checked English/German labels, damaged/low stock, consumables and four-digit quantities; no horizontal overflow or browser errors. Temporary preview removed.
