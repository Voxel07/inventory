import { useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import type { Item, ReturnSubmissionFormData } from '../../types';
import { useLocalizedText } from '../../utils/naming';

type Props = {
  item: Item;
  maxQuantity: number;
  assetInstanceId?: string;
  returnedForUserId?: string;
  factionOrderId?: string;
  onSubmit: (data: ReturnSubmissionFormData) => void;
  isLoading?: boolean;
};

export function ReturnSubmissionForm({
  item,
  maxQuantity,
  assetInstanceId,
  returnedForUserId,
  factionOrderId,
  onSubmit,
  isLoading,
}: Props) {
  const t = useLocalizedText();
  const serialized = item.trackingMode === 'serialized';
  const [quantity, setQuantity] = useState(serialized ? 1 : Math.max(1, maxQuantity));
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<File>();
  const returnLocation = item.expand?.returnLocation;
  const returnLocationLabel = returnLocation
    ? [returnLocation.name, returnLocation.location, returnLocation.position].filter(Boolean).join(' / ')
    : item.returnLocation || item.expand?.storageLocation?.name || item.storageLocation;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      itemId: item.id,
      quantity,
      assetInstanceId,
      returnedForUserId,
      factionOrderId,
      placementImageFile: image,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ pt: 1 }}>
      <Stack spacing={2}>
        <Alert severity="info">
          <Typography variant="subtitle2">{t('Vorgesehener Rückgabeort', 'Expected return location')}</Typography>
          <Typography variant="body2">{returnLocationLabel || '—'}</Typography>
        </Alert>
        <TextField
          label={t('Menge', 'Quantity')}
          type="number"
          value={quantity}
          disabled={serialized}
          onChange={(event) => setQuantity(Number(event.target.value))}
          slotProps={{ htmlInput: { min: 1, max: Math.max(1, maxQuantity) } }}
          required
        />
        <Button component="label" variant="outlined" startIcon={<AddAPhotoIcon />} disabled={isLoading}>
          {image ? image.name : t('Foto vom Ablageort hinzufügen', 'Add photo of where it was placed')}
          <input
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setImage(event.target.files?.[0])}
          />
        </Button>
        <TextField
          label={t('Hinweise zur Rückgabe', 'Return notes')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          multiline
          minRows={3}
        />
        <Button
          type="submit"
          variant="contained"
          color="success"
          disabled={isLoading || quantity < 1 || quantity > maxQuantity}
        >
          {isLoading
            ? t('Rückgabe wird gemeldet…', 'Submitting return…')
            : t('Rückgabe zur Prüfung melden', 'Submit return for acknowledgement')}
        </Button>
      </Stack>
    </Box>
  );
}
