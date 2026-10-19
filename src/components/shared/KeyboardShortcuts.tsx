import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, DialogContent, DialogTitle, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { Dialog } from './ClosableDialog';
import { useT } from '../../utils/naming';

/** Keys typed faster than this come from a barcode scanner, not a person. */
const SCANNER_INTERVAL_MS = 65;
const CHORD_TIMEOUT_MS = 1200;
const SEARCH_LABEL = /such|search/i;
const RESULT_ROW = '.MuiDataGrid-row, tbody tr, li, [role="row"], .MuiCard-root';

const GO_TO: Record<string, string> = {
    h: '/',
    i: '/items',
    a: '/assemblies',
    l: '/storage-locations',
    o: '/orders',
    e: '/events',
    t: '/events/attendees',
    p: '/profile',
};

function isEditable(el: Element | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
    if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file'].includes(el.type);
    return el.getAttribute('role') === 'combobox';
}

function isVisible(el: HTMLElement) {
    return el.getClientRects().length > 0;
}

/** Dialogs, menus and popovers own the keyboard while open; kept-mounted closed ones are hidden. */
function overlayOpen() {
    return Boolean(document.querySelector('.MuiModal-root:not(.MuiModal-hidden)'));
}

function main() {
    return document.getElementById('main-content');
}

function searchLabel(input: HTMLInputElement) {
    return [input.labels?.[0]?.textContent, input.placeholder, input.getAttribute('aria-label')].filter(Boolean).join(' ');
}

/** The page's own search: an explicit search input first, else a text field labelled "search". */
function findSearchInput(): HTMLInputElement | null {
    const root = main();
    if (!root) return null;
    const inputs = [...root.querySelectorAll<HTMLInputElement>('input')].filter(isVisible);
    return inputs.find((input) => input.type === 'search')
        ?? inputs.find((input) => input.type === 'text' && SEARCH_LABEL.test(searchLabel(input)))
        ?? null;
}

function isSearchInput(el: Element | null): el is HTMLInputElement {
    return el instanceof HTMLInputElement && Boolean(main()?.contains(el)) && el.getAttribute('role') !== 'combobox'
        && (el.type === 'search' || (el.type === 'text' && SEARCH_LABEL.test(searchLabel(el))));
}

/** The first link of each result row after the search field, in reading order. */
function resultLinks(): HTMLAnchorElement[] {
    const root = main();
    if (!root) return [];
    const search = findSearchInput();
    const seen = new Set<Element>();
    return [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((link) => {
        if (!isVisible(link)) return false;
        if (search && !(search.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
        const row = link.closest(RESULT_ROW);
        if (!row || !root.contains(row) || seen.has(row)) return false;
        seen.add(row);
        return true;
    });
}

function focusResult(link: HTMLElement | undefined) {
    if (!link) return false;
    link.focus();
    link.scrollIntoView({ block: 'nearest' });
    return true;
}

/** Without in-app history, go up one level instead of leaving the app. */
function backTarget(): number | string {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    return index > 0 ? -1 : window.location.pathname.replace(/\/[^/]+\/?$/, '') || '/';
}

/**
 * App-wide keyboard navigation. Mounted once inside the router; shows the
 * shortcut overview on "?".
 */
export function KeyboardShortcuts() {
    const t = useT();
    const navigate = useNavigate();
    const [helpOpen, setHelpOpen] = useState(false);
    const chordAt = useRef(0);
    const lastKeyAt = useRef(0);

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const now = Date.now();
            const fast = now - lastKeyAt.current < SCANNER_INTERVAL_MS;
            lastKeyAt.current = now;
            if (event.defaultPrevented || event.isComposing) return;
            const active = document.activeElement;
            const plain = !event.ctrlKey && !event.metaKey && !event.altKey;

            // Ctrl/Cmd+K reaches the page search from anywhere, even from another field.
            if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
                if (overlayOpen()) return;
                const search = findSearchInput();
                if (!search) return;
                event.preventDefault();
                search.focus();
                search.select();
                return;
            }

            if (isSearchInput(active) && plain && !overlayOpen()) {
                if (event.key === 'ArrowDown' && focusResult(resultLinks()[0])) { event.preventDefault(); return; }
                if (event.key === 'Enter' && !event.shiftKey && active.value.trim() && !active.closest('form')) {
                    const first = resultLinks()[0];
                    if (first) { event.preventDefault(); first.click(); }
                    return;
                }
                if (event.key === 'Escape' && !active.closest('.MuiAutocomplete-root')) { active.blur(); return; }
                return;
            }

            if (isEditable(active) || !plain || overlayOpen()) { chordAt.current = 0; return; }

            // Moving through results: arrows or j/k, Enter opens the link natively.
            const links = resultLinks();
            const index = links.findIndex((link) => link === active);
            const down = event.key === 'ArrowDown' || event.key === 'j';
            const up = event.key === 'ArrowUp' || event.key === 'k';
            if (index >= 0 && (down || up)) {
                event.preventDefault();
                event.stopPropagation();
                if (up && index === 0) { findSearchInput()?.focus(); return; }
                focusResult(links[index + (down ? 1 : -1)] ?? links[index]);
                return;
            }
            // A focused grid cell opens its row.
            if (event.key === 'Enter' && active instanceof HTMLElement && active.classList.contains('MuiDataGrid-cell')) {
                const link = active.closest('.MuiDataGrid-row')?.querySelector<HTMLAnchorElement>('a[href]');
                if (link) { event.preventDefault(); event.stopPropagation(); link.click(); }
                return;
            }

            if (fast) { chordAt.current = 0; return; }

            if (chordAt.current && now - chordAt.current < CHORD_TIMEOUT_MS) {
                chordAt.current = 0;
                const path = GO_TO[event.key];
                if (path) { event.preventDefault(); void navigate(path); }
                return;
            }
            chordAt.current = 0;

            switch (event.key) {
                case '/': {
                    const search = findSearchInput();
                    if (search) { event.preventDefault(); search.focus(); search.select(); }
                    return;
                }
                case 'j':
                    if (focusResult(links[0])) event.preventDefault();
                    return;
                case 'Backspace': {
                    event.preventDefault();
                    const target = backTarget();
                    void (typeof target === 'number' ? navigate(target) : navigate(target));
                    return;
                }
                case 'g':
                    chordAt.current = now;
                    return;
                case '?':
                    event.preventDefault();
                    setHelpOpen(true);
                    return;
            }
        }
        // Capture so result rows inside data grids move before the grid's own cell navigation.
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [navigate]);

    const rows: [string[], string][] = [
        [['/', 'Ctrl K'], t('shared.keyboardShortcuts.focusThePageSearch')],
        [['↓'], t('shared.keyboardShortcuts.moveFromTheSearchIntoTheResults')],
        [['Enter'], t('shared.keyboardShortcuts.inTheSearchOpenTheFirstMatchInTheResults')],
        [['↑', '↓', 'j', 'k'], t('shared.keyboardShortcuts.moveBetweenResults')],
        [['Esc'], t('shared.keyboardShortcuts.leaveTheSearch')],
        [['Backspace'], t('shared.keyboardShortcuts.goBack')],
        [['g h'], t('nav.home')],
        [['g i'], t('nav.items')],
        [['g a'], t('nav.assemblies')],
        [['g l'], t('nav.storageLocations')],
        [['g o'], t('nav.orders')],
        [['g e'], t('common.eventPlanning')],
        [['g t'], t('common.eventAttendees')],
        [['g p'], t('profile.title')],
        [['?'], t('shared.keyboardShortcuts.thisOverview')],
    ];

    return <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('shared.keyboardShortcuts.keyboardShortcuts')}</DialogTitle>
        <DialogContent dividers>
            <Table size="small" aria-label={t('shared.keyboardShortcuts.keyboardShortcuts')}>
                <TableBody>
                    {rows.map(([keys, label]) => <TableRow key={keys.join()}>
                        <TableCell sx={{ whiteSpace: 'nowrap', width: '1%' }}>
                            {keys.map((key, index) => <Box key={key} component="span">
                                {index > 0 && <Typography component="span" variant="body2" color="text.secondary"> / </Typography>}
                                <Box component="kbd" sx={{ px: 0.75, py: 0.25, border: 1, borderColor: 'divider', borderRadius: 0.5, fontFamily: 'monospace', fontSize: '0.8125rem' }}>{key}</Box>
                            </Box>)}
                        </TableCell>
                        <TableCell>{label}</TableCell>
                    </TableRow>)}
                </TableBody>
            </Table>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                {t('shared.keyboardShortcuts.shortcutsAreInactiveInInputFieldsAndOpenDialogs')}
            </Typography>
        </DialogContent>
    </Dialog>;
}
