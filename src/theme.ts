import { createTheme } from '@mui/material';
import type {} from '@mui/x-data-grid/themeAugmentation';
import { IconButton } from './components/shared/ActionButtons';
import { translate } from './utils/naming';

export type ThemeMode = 'light' | 'dark';

export const SANS_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
/** Reserved for identifiers: asset codes, SKUs, order and document references. */
export const MONO_FONT = 'ui-monospace, "SFMono-Regular", "Cascadia Mono", "Segoe UI Mono", Consolas, "Liberation Mono", monospace';

/**
 * Semantic colour tokens per mode. Every text/background pairing used by the
 * shell was checked against WCAG 2.2: text ≥ 4.5:1, input borders and icons ≥ 3:1.
 */
export const tokens = {
  light: {
    page: '#f6f7f9',
    paper: '#ffffff',
    subtle: '#f1f3f6',
    selected: '#e8eaf6',
    border: '#e1e4ea',
    inputBorder: '#8a90a0',
    text: '#16181d',
    textSecondary: '#5a6170',
    primary: '#3949ab',
    primaryStrong: '#283593',
    onPrimary: '#ffffff',
    success: '#2a6f2e',
    warning: '#8a5300',
    error: '#c62828',
    info: '#0a5fb4',
  },
  dark: {
    page: '#111318',
    paper: '#1a1d23',
    subtle: '#22262e',
    selected: '#262c45',
    border: '#2e333c',
    inputBorder: '#6b7280',
    text: '#eef0f3',
    textSecondary: '#a9b0bd',
    primary: '#9fa8da',
    primaryStrong: '#c5cae9',
    onPrimary: '#111318',
    success: '#81c784',
    warning: '#ffb74d',
    error: '#f28b82',
    info: '#7cb8f0',
  },
} as const;

/** Product touch target; WCAG AA only requires 24 × 24 px. */
const TOUCH_TARGET = 44;
const PHONE = '@media (max-width: 599.95px)';

export function buildTheme(mode: ThemeMode) {
  const c = tokens[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: c.primary, dark: c.primaryStrong, contrastText: c.onPrimary },
      secondary: { main: c.textSecondary, contrastText: c.paper },
      background: { default: c.page, paper: c.paper },
      text: { primary: c.text, secondary: c.textSecondary },
      divider: c.border,
      success: { main: c.success },
      warning: { main: c.warning },
      error: { main: c.error },
      info: { main: c.info },
      action: { selected: c.selected },
    },
    typography: {
      fontFamily: SANS_FONT,
      // Page title; rendered as the page's h1 (see variantMapping below).
      h4: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.25, letterSpacing: 0, '@media (min-width: 900px)': { fontSize: '1.875rem' } },
      h5: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3, letterSpacing: 0 },
      h6: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.35, letterSpacing: 0 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      body1: { lineHeight: 1.5 },
      body2: { lineHeight: 1.5 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: c.page },
          '::selection': { backgroundColor: c.selected, color: c.text },
          'code, kbd, samp, .mono': { fontFamily: MONO_FONT, fontSize: '0.92em' },
          '.tabular, .MuiTableCell-root, .MuiDataGrid-cell': { fontVariantNumeric: 'tabular-nums' },
        },
      },
      MuiTypography: {
        defaultProps: {
          // Heading rank follows the page structure, not visual size.
          variantMapping: { h4: 'h1', h5: 'h2', h6: 'h2', subtitle1: 'h3', subtitle2: 'h3' },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          // Routine surfaces are flat with a restrained border; menus and popovers keep their elevation.
          root: ({ ownerState }) => ({
            backgroundImage: 'none',
            ...(ownerState.variant !== 'outlined' && !ownerState.elevation ? { border: `1px solid ${c.border}` } : {}),
          }),
          outlined: { borderColor: c.border },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 40, [PHONE]: { minHeight: TOUCH_TARGET } },
          outlined: { borderColor: c.inputBorder },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { [PHONE]: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET } },
        },
      },
      MuiToggleButton: {
        styleOverrides: { root: { textTransform: 'none', [PHONE]: { minHeight: TOUCH_TARGET } } },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 500 } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.border },
          head: { backgroundColor: c.subtle, color: c.textSecondary, fontWeight: 600 },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: { borderColor: c.border, backgroundColor: c.paper, '--DataGrid-containerBackground': c.subtle },
          columnHeaderTitle: { fontWeight: 600, color: c.textSecondary },
        },
      },
      MuiTablePagination: {
        defaultProps: {
          getItemAriaLabel: (type) => ({
            first: translate('Die erste Seite anzeigen', 'Display the first page'),
            last: translate('Die letzte Seite anzeigen', 'Display the last page'),
            next: translate('Die nächste Seite anzeigen', 'Display the next page'),
            previous: translate('Die vorherige Seite anzeigen', 'Display the previous page'),
          })[type],
          slots: { actions: {
            firstButton: IconButton, lastButton: IconButton,
            nextButton: IconButton, previousButton: IconButton,
          } },
        },
        styleOverrides: {
          root: { width: '100%', minWidth: 0 },
          toolbar: { justifyContent: 'flex-end', flexWrap: 'wrap' },
          spacer: { display: 'none' },
          actions: { display: 'flex', alignItems: 'center', flexShrink: 0 },
        },
      },
      MuiTableRow: {
        styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: c.subtle } } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: c.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: c.inputBorder },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.text },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.primary, borderWidth: 2 },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: c.error },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { '&.Mui-focused': { color: c.primary }, '&.Mui-error': { color: c.error } } },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { marginLeft: 0, marginRight: 0 } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: ({ ownerState }) => ({
            borderRadius: ownerState.fullScreen ? 0 : 12,
            border: ownerState.fullScreen ? 0 : `1px solid ${c.border}`,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)',
          }),
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: '1.125rem', fontWeight: 600 } },
      },
      MuiAppBar: {
        defaultProps: { color: 'inherit' },
        styleOverrides: {
          root: { backgroundImage: 'none', backgroundColor: c.paper, color: c.text, border: 0, borderBottom: `1px solid ${c.border}`, boxShadow: 'none' },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: c.paper, color: c.text, border: 0, borderRight: `1px solid ${c.border}`, boxShadow: 'none' },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&.Mui-selected': { backgroundColor: c.selected, color: c.primaryStrong, '& .MuiListItemIcon-root': { color: c.primaryStrong } },
            '&.Mui-selected:hover': { backgroundColor: c.selected },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: { root: { color: c.textSecondary, minWidth: 40 } },
      },
      MuiListSubheader: {
        styleOverrides: { root: { backgroundColor: 'transparent', color: c.textSecondary, fontWeight: 600, fontSize: '0.75rem', lineHeight: '32px' } },
      },
      MuiBottomNavigation: {
        styleOverrides: { root: { backgroundColor: c.paper } },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            color: c.textSecondary,
            minWidth: 0,
            '&.Mui-selected': { color: c.primaryStrong },
            '& .MuiBottomNavigationAction-label': { fontSize: '0.75rem', '&.Mui-selected': { fontSize: '0.75rem', fontWeight: 600 } },
          },
        },
      },
      MuiTabs: {
        defaultProps: {
          slotProps: { scrollButtons: {
            title: translate('Weitere Registerkarten anzeigen', 'Show more tabs'),
            'aria-label': translate('Weitere Registerkarten anzeigen', 'Show more tabs'),
          } },
        },
      },
      MuiTab: {
        styleOverrides: { root: { fontWeight: 600, minHeight: 48 } },
      },
      MuiAlert: {
        defaultProps: {
          closeText: translate('Diese Meldung schließen', 'Dismiss this message'),
          slots: { closeButton: IconButton },
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0 },
        styleOverrides: { root: { border: `1px solid ${c.border}`, borderRadius: 8, '&::before': { display: 'none' } } },
      },
      MuiAutocomplete: {
        defaultProps: {
          clearText: translate('Auswahl löschen', 'Clear the selection'),
          openText: translate('Auswahlmöglichkeiten anzeigen', 'Show available options'),
          closeText: translate('Auswahlmöglichkeiten schließen', 'Hide available options'),
        },
      },
    },
  });
}
