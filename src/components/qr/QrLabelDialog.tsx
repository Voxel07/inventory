import { DialogContent, DialogTitle } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { QRCodeGenerator } from './QRCodeGenerator';
import type { QRResourceType } from '../../utils/qrCode';

export interface QrLabel {
  title: string;
  /** ID encoded in the QR payload. */
  itemId: string;
  itemName: string;
  resourceType?: QRResourceType;
  textCode?: string;
}

/** The printable QR label dialog shared by items, assets and faction orders. */
export function QrLabelDialog({ label, onClose }: { label: QrLabel | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(label)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{label?.title}</DialogTitle>
      <DialogContent>
        {label && <QRCodeGenerator itemId={label.itemId} itemName={label.itemName} resourceType={label.resourceType} textCode={label.textCode} />}
      </DialogContent>
    </Dialog>
  );
}
