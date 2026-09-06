import { Box, type SxProps, type Theme } from '@mui/material';
import { useMediaUrl } from '../../hooks/useMediaUrl';

export function MediaImage({ src, alt, sx }: { src?: string; alt: string; sx?: SxProps<Theme> }) {
  const url = useMediaUrl(src);
  return url
    ? <Box component="img" src={url} alt={alt} sx={sx} />
    : <Box role="img" aria-label={alt} sx={sx} />;
}
