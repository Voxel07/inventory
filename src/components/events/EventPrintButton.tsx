import { useState } from 'react';
import PrintIcon from '@mui/icons-material/Print';
import { Button } from '../shared/ActionButtons';
import { formatDate } from '../../utils/dateFormat';
import { useAppLanguage, useT } from '../../utils/naming';
import { printTable, type PrintTableOptions } from '../../utils/printTable';
import { useUIStore } from '../../store/uiStore';
import type { EventReport } from '../../types';

export function EventPrintButton({ event, title, columns, rows, summary, disabled }: {
  event: EventReport;
  disabled?: boolean;
} & Pick<PrintTableOptions, 'title' | 'columns' | 'rows' | 'summary'>) {
  const t = useT();
  const language = useAppLanguage();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    try {
      await printTable({
        title, subtitle: `${event.name} · ${event.eventType}`, columns, rows, summary, language,
        description: `${formatDate(event.startDate)} – ${formatDate(event.endDate)} · ${t('events.eventWorkspace.allTimesAreLocalToTheEvent')}`,
      });
    } catch {
      showSnackbar(t('common.couldNotPrint'), 'error');
    } finally {
      setPrinting(false);
    }
  }

  return <Button variant="outlined" startIcon={<PrintIcon />} disabled={disabled || printing || !rows.length}
    onClick={() => { void handlePrint(); }}>{t('common.print')}</Button>;
}
