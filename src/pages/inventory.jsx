import Box from '@mui/material/Box';

import Items from '../components/Items';

export default function LabTabs() {

  return (
    <Box sx={{ width: '100%', typography: 'body1' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Items/>
        </Box>
    </Box>
  );
}
