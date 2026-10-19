import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Autocomplete, Box, Checkbox, Chip, Collapse, FormControlLabel, Stack, TextField, Typography, createFilterOptions } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import { Button, IconButton } from '../shared/ActionButtons';
import { DialogForm, FormDialog } from '../shared/FormDialog';
import { useSaveStorageStructure } from '../../hooks/useStorageLocations';
import { useUIStore } from '../../store/uiStore';
import type { StorageLocation, StorageNodeInput } from '../../types';
import { buildLocationTree, type LocationTreeNode } from '../../utils/locationHierarchy';
import { MAX_GENERATED_PLACES, generateStoragePlaces, generatedCount, hasChildLevel, type GeneratedNode, type StorageGeneratorSpec } from '../../utils/storageGenerator';
import { translate, useT } from '../../utils/naming';

/** One row of the structure editor; `id` marks a saved location, `key` is stable for new rows too. */
interface EditorNode {
  key: string;
  id?: string;
  name: string;
  code: string;
  description?: string;
  /** Saved values, to send only what changed. */
  original?: { name: string; code: string };
  children: EditorNode[];
}

let nextKey = 0;
const newKey = () => `new-${++nextKey}`;

function fromTree(node: LocationTreeNode): EditorNode {
  const { location } = node;
  return { key: location.id, id: location.id, name: location.name, code: location.code, description: location.description,
    original: { name: location.name, code: location.code }, children: node.children.map(fromTree) };
}

function fromGenerated(node: GeneratedNode): EditorNode {
  return { key: newKey(), name: node.name, code: '', children: node.children.map(fromGenerated) };
}

/** New and changed rows, plus the saved rows on the way to them; unchanged saved branches are left out. */
function toInput(nodes: EditorNode[]): StorageNodeInput[] {
  return nodes.flatMap((node) => {
    const children = toInput(node.children);
    const changed = !node.id || node.name.trim() !== node.original?.name || node.code.trim().toUpperCase() !== node.original?.code;
    if (!changed && children.length === 0) return [];
    return [{ id: node.id, name: node.name.trim(), code: node.code.trim() || undefined, description: node.description, children }];
  });
}

function update(nodes: EditorNode[], key: string, change: (node: EditorNode) => EditorNode | null): EditorNode[] {
  return nodes.flatMap((node) => {
    if (node.key === key) { const next = change(node); return next ? [next] : []; }
    return [{ ...node, children: update(node.children, key, change) }];
  });
}

function hasBlankName(nodes: EditorNode[]): boolean {
  return nodes.some((node) => !node.name.trim() || hasBlankName(node.children));
}

function countNew(nodes: EditorNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.id ? 0 : 1) + countNew(node.children), 0);
}

function ancestorsOf(nodes: EditorNode[], key: string, path: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.key === key) return path;
    const found = ancestorsOf(node.children, key, [...path, node.key]);
    if (found) return found;
  }
  return null;
}

type RootOption = StorageLocation | { create: string };
const filterRoots = createFilterOptions<RootOption>({ stringify: (option) => 'create' in option ? option.create : `${option.name} ${option.code}` });

/** Saved branches start collapsed; only the path to the focused location is open. */
function collapsedKeys(nodes: EditorNode[], focusId?: string): Set<string> {
  const keys = new Set<string>();
  const collect = (list: EditorNode[]) => list.forEach((entry) => { if (entry.children.length) keys.add(entry.key); collect(entry.children); });
  collect(nodes);
  if (focusId) {
    for (const key of ancestorsOf(nodes, focusId) ?? []) keys.delete(key);
    keys.delete(focusId);
  }
  return keys;
}

/**
 * One dialog for the whole storage structure: find a top-level location by name or create it, then add sections and
 * (nested) storage places — one by one or generated in bulk — and save everything in one step.
 * Mount it only while open: every opening starts from the saved structure.
 */
export function StorageStructureDialog({ onClose, locations, rootId, focusId, canCreatePublic, onSaved }: {
  onClose: () => void;
  /** Complete location list (active and inactive) the editor loads existing structure from. */
  locations: StorageLocation[];
  /** Opens the dialog on this top-level location. */
  rootId?: string;
  /** Expands the editor down to this section or storage place. */
  focusId?: string;
  canCreatePublic: boolean;
  onSaved: (rootId: string) => void;
}) {
  const t = useT();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const save = useSaveStorageStructure();
  const roots = useMemo(() => locations.filter((location) => location.depth === 0 && location.active)
    .sort((a, b) => a.name.localeCompare(b.name)), [locations]);
  const tree = useMemo(() => buildLocationTree(locations.filter((location) => location.active)), [locations]);

  const sectionsOf = (location: StorageLocation | null) =>
    (location ? tree.find((entry) => entry.location.id === location.id)?.children ?? [] : []).map(fromTree);
  const [preset] = useState(() => (rootId ? roots.find((location) => location.id === rootId) ?? null : null));
  const [root, setRoot] = useState<StorageLocation | null>(preset);
  const [chosen, setChosen] = useState(Boolean(preset));
  const [name, setName] = useState(preset?.name ?? '');
  const [code, setCode] = useState(preset?.code ?? '');
  const [description, setDescription] = useState(preset?.description ?? '');
  const [privateResource, setPrivateResource] = useState(preset ? Boolean(preset.access?.privateResource) : !canCreatePublic);
  const [sections, setSections] = useState<EditorNode[]>(() => sectionsOf(preset));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => collapsedKeys(sections, focusId));
  const [showCodes, setShowCodes] = useState(false);
  const [generatorFor, setGeneratorFor] = useState<string | null>(null);

  function choose(location: StorageLocation | null, typedName: string) {
    setRoot(location); setChosen(true);
    setName(location?.name ?? typedName); setCode(location?.code ?? ''); setDescription(location?.description ?? '');
    setPrivateResource(location ? Boolean(location.access?.privateResource) : !canCreatePublic);
    const loaded = sectionsOf(location);
    setSections(loaded);
    setCollapsed(collapsedKeys(loaded));
  }

  const addChild = (parentKey: string | null, nodes: EditorNode[]) => {
    if (parentKey === null) { setSections((current) => [...current, ...nodes]); return; }
    setSections((current) => update(current, parentKey, (node) => ({ ...node, children: [...node.children, ...nodes] })));
    setCollapsed((current) => { const next = new Set(current); next.delete(parentKey); return next; });
  };
  const toggle = (key: string) => setCollapsed((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });

  const newCount = countNew(sections);
  const invalid = !name.trim() || hasBlankName(sections);

  function submit() {
    if (invalid) return;
    save.mutate({ id: root?.id, name: name.trim(), code: code.trim() || undefined, description: description || undefined,
      privateResource: root ? undefined : privateResource, sections: toInput(sections) }, {
      onSuccess: (saved) => {
        const savedRoot = saved.find((location) => location.depth === 0) ?? saved[0];
        showSnackbar(t('pages.storageLocations.structureSaved'), 'success');
        onClose();
        if (savedRoot) onSaved(savedRoot.id);
      },
      onError: (error) => showSnackbar(error.message, 'error'),
    });
  }

  const renderNodes = (nodes: EditorNode[], depth: number): ReactNode => nodes.map((node) => {
    const isCollapsed = collapsed.has(node.key);
    const role = depth === 1 ? 'section' : 'place';
    return <Box key={node.key} sx={{ ml: depth > 1 ? { xs: 1.5, sm: 3 } : 0, borderLeft: depth > 1 ? 1 : 0, borderColor: 'divider', pl: depth > 1 ? 1 : 0 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', py: 0.5 }}>
        <IconButton size="small" title={isCollapsed ? t('pages.storageLocations.expand') : t('pages.storageLocations.collapse')}
          disabled={node.children.length === 0} onClick={() => toggle(node.key)} sx={{ visibility: node.children.length ? 'visible' : 'hidden' }}>
          {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <TextField size="small" fullWidth required value={node.name} autoFocus={!node.id && node.name === ''}
          label={role === 'section' ? t('pages.storageLocations.sectionName') : t('pages.storageLocations.placeName')}
          placeholder={role === 'section' ? t('pages.storageLocations.sectionExample') : t('pages.storageLocations.placeExample')}
          onChange={(event) => setSections((current) => update(current, node.key, (entry) => ({ ...entry, name: event.target.value })))}
          slotProps={{ input: { endAdornment: node.id ? <Chip size="small" variant="outlined" label={t('pages.storageLocations.saved')} /> : undefined } }} />
        {showCodes && <TextField size="small" label={t('forms.itemForm.locationCode')} value={node.code} sx={{ width: 110, flexShrink: 0 }}
          slotProps={{ htmlInput: { maxLength: 32, className: 'mono' } }}
          onChange={(event) => setSections((current) => update(current, node.key, (entry) => ({ ...entry, code: event.target.value.toUpperCase() })))} />}
        {node.children.length > 0 && <Chip size="small" label={node.children.length} sx={{ flexShrink: 0 }} />}
        <IconButton size="small" title={t('pages.storageLocations.addStoragePlace')} onClick={() => addChild(node.key, [{ key: newKey(), name: '', code: '', children: [] }])}>
          <AddIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" title={t('pages.storageLocations.generatePlaces')} onClick={() => setGeneratorFor(node.key)}>
          <PlaylistAddIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" color="error" title={node.id ? t('pages.storageLocations.savedLocationsAreDeactivatedInTheDetails') : t('pages.storageLocations.removeRow')}
          disabled={Boolean(node.id)} onClick={() => setSections((current) => update(current, node.key, () => null))}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Collapse in={!isCollapsed} unmountOnExit>{renderNodes(node.children, depth + 1)}</Collapse>
    </Box>;
  });

  return <FormDialog open onClose={onClose} maxWidth="md">
    <DialogForm title={root ? t('pages.storageLocations.editStructureOf', { name: root.name }) : t('pages.storageLocations.newStorageLocation')}
      onSubmit={submit} onCancel={onClose} noValidate pending={save.isPending} submitDisabled={!chosen || invalid}
      submitLabel={newCount > 0 ? t('pages.storageLocations.saveWithNew', { count: newCount }) : t('common.save')}>
      {!chosen ? <Stack spacing={1}>
        <Autocomplete<RootOption, false, false, false> autoHighlight openOnFocus options={roots} value={null}
          getOptionLabel={(option) => 'create' in option ? option.create : option.name}
          isOptionEqualToValue={(option, value) => ('create' in option ? option.create : option.id) === ('create' in value ? value.create : value.id)}
          noOptionsText={t('pages.storageLocations.locationNameHelp')}
          filterOptions={(options, state) => {
            const filtered = filterRoots(options, state);
            const typed = state.inputValue.trim();
            const known = roots.some((location) => location.name.toLowerCase() === typed.toLowerCase());
            return typed && !known ? [...filtered, { create: typed }] : filtered;
          }}
          renderOption={({ key, ...props }, option) => <Box component="li" key={key} {...props}>
            {'create' in option
              ? <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><AddIcon fontSize="small" color="primary" /><span>{t('pages.storageLocations.createLocationNamed', { name: option.create })}</span></Stack>
              : <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{option.name}</Typography>
                <Typography variant="caption" color="text.secondary" className="mono">{option.fullCode}</Typography></Box>}
          </Box>}
          onChange={(_event, option) => {
            if (!option) return;
            if ('create' in option) choose(null, option.create);
            else choose(option, '');
          }}
          renderInput={(params) => <TextField {...params} autoFocus label={t('pages.storageLocations.locationName')}
            placeholder={t('pages.storageLocations.locationExample')} helperText={t('pages.storageLocations.locationNameHelp')} />} />
      </Stack> : <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
          <TextField required fullWidth label={t('pages.storageLocations.locationName')} value={name} onChange={(event) => setName(event.target.value)}
            helperText={root ? t('pages.storageLocations.existingLocation') : t('pages.storageLocations.newLocationWillBeCreated')} />
          {showCodes && <TextField label={t('forms.itemForm.locationCode')} value={code} sx={{ width: { sm: 140 } }}
            slotProps={{ htmlInput: { maxLength: 32, className: 'mono' } }} onChange={(event) => setCode(event.target.value.toUpperCase())} />}
          {!rootId && <Button title={translate('pages.storageLocations.chooseAnotherLocation')} onClick={() => setChosen(false)} sx={{ flexShrink: 0, mt: { sm: 1 } }}>
            {t('pages.storageLocations.otherLocation')}
          </Button>}
        </Stack>
        <TextField label={t('common.description')} value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={1} fullWidth />
        {!root && <FormControlLabel label={t('pages.storageLocations.privateStorageLocationOwnerInventoryAdminsAndExplicitSharesOnly')}
          control={<Checkbox checked={privateResource} disabled={!canCreatePublic} onChange={(_, checked) => setPrivateResource(checked)} />} />}
        <Alert severity="info">{t('pages.storageLocations.structureHelp')}</Alert>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('pages.storageLocations.sections')} ({sections.length})</Typography>
          <FormControlLabel label={t('pages.storageLocations.editCodes')} control={<Checkbox size="small" checked={showCodes} onChange={(_, checked) => setShowCodes(checked)} />} />
        </Stack>
        {sections.length === 0 && <Typography variant="body2" color="text.secondary">{t('pages.storageLocations.noSectionsYet')}</Typography>}
        <Box>{renderNodes(sections, 1)}</Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button title={translate('pages.storageLocations.addASectionToThisLocation')} variant="outlined" startIcon={<AddIcon />}
            onClick={() => addChild(null, [{ key: newKey(), name: '', code: '', children: [] }])}>{t('pages.storageLocations.addSection')}</Button>
          <Button title={translate('pages.storageLocations.generateNumberedSections')} startIcon={<PlaylistAddIcon />} onClick={() => setGeneratorFor('')}>
            {t('pages.storageLocations.generateSections')}
          </Button>
        </Stack>
      </Stack>}
    </DialogForm>
    <GeneratorDialog open={generatorFor !== null} sectionLevel={generatorFor === ''} onClose={() => setGeneratorFor(null)}
      onGenerate={(nodes) => { addChild(generatorFor || null, nodes.map(fromGenerated)); setGeneratorFor(null); }} />
  </FormDialog>;
}

/** Numbered places in one go: "Regal" 1–4, optionally each with "Fach" 1–8. */
function GeneratorDialog({ open, sectionLevel, onClose, onGenerate }: {
  open: boolean;
  sectionLevel: boolean;
  onClose: () => void;
  onGenerate: (nodes: GeneratedNode[]) => void;
}) {
  const t = useT();
  const [spec, setSpec] = useState<StorageGeneratorSpec>({ prefix: '', from: 1, to: 4 });
  const [nested, setNested] = useState(false);
  const effective: StorageGeneratorSpec = nested ? { ...spec, childPrefix: spec.childPrefix ?? '', childFrom: spec.childFrom ?? 1, childTo: spec.childTo ?? 8 }
    : { prefix: spec.prefix, from: spec.from, to: spec.to };
  const count = generatedCount(effective);
  const tooMany = count > MAX_GENERATED_PLACES;
  const preview = generateStoragePlaces(effective);
  const number = (value: string) => (value === '' ? Number.NaN : Number(value));
  const first = preview[0]; const last = preview[preview.length - 1];

  return <FormDialog open={open} onClose={onClose} maxWidth="xs">
    <DialogForm title={sectionLevel ? t('pages.storageLocations.generateSections') : t('pages.storageLocations.generatePlaces')}
      onSubmit={() => onGenerate(preview)} onCancel={onClose} noValidate submitDisabled={count === 0 || tooMany}
      submitLabel={t('pages.storageLocations.addCount', { count })}>
      <Stack spacing={2}>
        <TextField label={t('pages.storageLocations.namePrefix')} value={spec.prefix} autoFocus
          placeholder={sectionLevel ? t('pages.storageLocations.sectionPrefixExample') : t('pages.storageLocations.placePrefixExample')}
          onChange={(event) => setSpec({ ...spec, prefix: event.target.value })} />
        <Stack direction="row" spacing={1}>
          <TextField type="number" label={t('pages.storageLocations.from')} value={Number.isNaN(spec.from) ? '' : spec.from} onChange={(event) => setSpec({ ...spec, from: number(event.target.value) })} fullWidth />
          <TextField type="number" label={t('pages.storageLocations.to')} value={Number.isNaN(spec.to) ? '' : spec.to} onChange={(event) => setSpec({ ...spec, to: number(event.target.value) })} fullWidth />
        </Stack>
        <FormControlLabel label={t('pages.storageLocations.eachWithSubPlaces')} control={<Checkbox checked={nested} onChange={(_, checked) => setNested(checked)} />} />
        {nested && <>
          <TextField label={t('pages.storageLocations.subPlacePrefix')} value={effective.childPrefix} placeholder={t('pages.storageLocations.subPlacePrefixExample')}
            onChange={(event) => setSpec({ ...spec, childPrefix: event.target.value })} />
          <Stack direction="row" spacing={1}>
            <TextField type="number" label={t('pages.storageLocations.from')} value={Number.isNaN(effective.childFrom) ? '' : effective.childFrom} onChange={(event) => setSpec({ ...spec, childFrom: number(event.target.value) })} fullWidth />
            <TextField type="number" label={t('pages.storageLocations.to')} value={Number.isNaN(effective.childTo) ? '' : effective.childTo} onChange={(event) => setSpec({ ...spec, childTo: number(event.target.value) })} fullWidth />
          </Stack>
        </>}
        {tooMany ? <Alert severity="warning">{t('pages.storageLocations.tooManyPlaces', { max: MAX_GENERATED_PLACES })}</Alert>
          : first && <Typography variant="body2" color="text.secondary">
            {first.name}{preview.length > 1 ? ` … ${last.name}` : ''}
            {hasChildLevel(effective) && first.children.length > 0 ? ` · ${first.children[0].name}${first.children.length > 1 ? ` … ${first.children[first.children.length - 1].name}` : ''}` : ''}
            {` (${count})`}
          </Typography>}
      </Stack>
    </DialogForm>
  </FormDialog>;
}
