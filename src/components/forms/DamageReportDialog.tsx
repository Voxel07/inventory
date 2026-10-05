import { DialogContent, DialogTitle, useMediaQuery, useTheme } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { DamageReportForm, type DamageReportFormProps } from './DamageReportForm';
import { useCreateDamageReport } from '../../hooks/useDamageReports';
import { useUIStore } from '../../store/uiStore';
import { useLocalizedText } from '../../utils/naming';
import { isOfflineQueuedError } from '../../utils/offline';
import type { DamageReportFormData } from '../../types';

type Props = Omit<DamageReportFormProps, 'onSubmit' | 'isLoading'> & {
  open: boolean;
  title: string;
  onClose: () => void;
};

/** Report damage for an item, asset or assembly; shared by the damage list and the detail pages. */
export function DamageReportDialog({ open, title, onClose, ...formProps }: Props) {
  const t = useLocalizedText();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const createReport = useCreateDamageReport();

  function submit(data: DamageReportFormData) {
    createReport.mutate(data, {
      onSuccess: () => {
        onClose();
        showSnackbar(t('Schadensbericht übermittelt', 'Damage report submitted'), 'success');
      },
      onError: (error) => {
        // The global mutation handler confirms that the report was queued for sync.
        if (isOfflineQueuedError(error)) { onClose(); return; }
        showSnackbar(t('Fehler beim Übermitteln des Schadensberichts', 'Could not submit damage report'), 'error');
      },
    });
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ pt: '24px !important' }}>
        <DamageReportForm {...formProps} onSubmit={submit} isLoading={createReport.isPending} />
      </DialogContent>
    </Dialog>
  );
}
