import { locationLabel } from '../../utils/locationHierarchy';
import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import type { Item, ReturnSubmissionFormData } from '../../types';
import { translate, useT } from '../../utils/naming';

type Props = {
  item: Item;
  maxQuantity: number;
  assetInstanceId?: string;
  returnedForUserId?: string;
  factionOrderId?: string;
  eventOccurrenceId?: string;
  onSubmit: (data: ReturnSubmissionFormData) => void;
  isLoading?: boolean;
};

export function ReturnSubmissionForm({
  item,
  maxQuantity,
  assetInstanceId,
  returnedForUserId,
  factionOrderId,
  eventOccurrenceId,
  onSubmit,
  isLoading,
}: Props) {
  const t = useT();
  const serialized = item.trackingMode === 'serialized';
  const [quantity, setQuantity] = useState(serialized ? 1 : Math.max(1, maxQuantity));
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<File>();
  const returnLocation = item.expand?.returnLocation;
  const returnLocationLabel = returnLocation
    ? locationLabel(returnLocation)
    : (!item.returnLocation || item.returnLocation === item.storageLocation ? item.expand?.storageLocation?.name : undefined);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      itemId: item.id,
      quantity,
      assetInstanceId,
      returnedForUserId,
      orderId: factionOrderId,
      eventOccurrenceId,
      placementImageFile: image,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ pt: 1 }}>
      <Stack spacing={2}>
        <Alert severity="info">
          <Typography variant="subtitle2">{t('forms.returnSubmissionForm.expectedReturnLocation')}</Typography>
          <Typography variant="body2">{returnLocationLabel || '—'}</Typography>
        </Alert>
        <TextField
          label={t('common.quantity')}
          type="number"
          value={quantity}
          disabled={serialized}
          onChange={(event) => setQuantity(Number(event.target.value))}
          slotProps={{ htmlInput: { min: 1, max: Math.max(1, maxQuantity) } }}
          required
        />
        <Button title={translate('forms.returnSubmissionForm.takeOrSelectAPhotoOfTheReturnLocation')} component="label" variant="outlined" startIcon={<AddAPhotoIcon />} disabled={isLoading}>
          {image ? image.name : t('forms.returnSubmissionForm.addPhotoOfWhereItWasPlaced')}
          <input
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setImage(event.target.files?.[0])}
          />
        </Button>
        <TextField
          label={t('forms.returnSubmissionForm.returnNotes')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          multiline
          minRows={3}
        />
        <Button title={translate('forms.returnSubmissionForm.submitTheReturnForAcknowledgement')}
          type="submit"
          variant="contained"
          color="success"
          disabled={isLoading || quantity < 1 || quantity > maxQuantity}
        >
          {isLoading
            ? t('forms.returnSubmissionForm.submittingReturn')
            : t('forms.returnSubmissionForm.submitReturnForAcknowledgement')}
        </Button>
      </Stack>
    </Box>
  );
}
