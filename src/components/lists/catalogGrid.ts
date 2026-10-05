/** Desktop catalog tables: auto-height rows sized by text, not by the default 38 px checkbox/icon hit areas. */
export const catalogGridSx = {
  '& .MuiDataGrid-row': { cursor: 'pointer' },
  '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', py: 0.5 },
  '& .MuiDataGrid-cellCheckbox .MuiCheckbox-root, & .MuiDataGrid-columnHeaderCheckbox .MuiCheckbox-root, & .MuiDataGrid-cell .MuiIconButton-root': { p: 0.5 },
} as const;
