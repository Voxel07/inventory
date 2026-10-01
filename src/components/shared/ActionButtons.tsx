import { forwardRef, type ElementType, type ReactNode } from 'react';
import {
  Box,
  Button as MuiButton,
  IconButton as MuiIconButton,
  Tab as MuiTab,
  ToggleButton as MuiToggleButton,
  ListItemButton as MuiListItemButton,
  BottomNavigationAction as MuiBottomNavigationAction,
  AccordionSummary as MuiAccordionSummary,
  Chip as MuiChip,
  MenuItem as MuiMenuItem,
  Tooltip,
  type SxProps,
  type Theme,
} from '@mui/material';
import type { SystemStyleObject } from '@mui/system';

// Disabled controls need a hover target. Keep their layout on the wrapper so
// full-width, positioned and grid-aligned buttons retain their placement.
const layoutKeys = new Set([
  'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'width', 'height',
  'm', 'mt', 'mr', 'mb', 'ml', 'mx', 'my', 'margin', 'marginTop',
  'marginRight', 'marginBottom', 'marginLeft', 'marginX', 'marginY',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'justifySelf',
  'gridArea', 'gridColumn', 'gridRow', 'order',
]);

function splitStyle(style: SystemStyleObject<Theme>, layout: boolean): SystemStyleObject<Theme> {
  return Object.fromEntries(Object.entries(style ?? {}).flatMap(([key, value]) => {
    if (key.startsWith('@') && value && typeof value === 'object') {
      return [[key, splitStyle(value as SystemStyleObject<Theme>, layout)]];
    }
    return layoutKeys.has(key) === layout ? [[key, value]] : [];
  })) as SystemStyleObject<Theme>;
}

type SxArray = Extract<SxProps<Theme>, readonly unknown[]>;

function splitSx(sx: SxProps<Theme> | undefined, layout: boolean): SxArray {
  const styles = Array.isArray(sx) ? sx : [sx];
  return styles.map((style) => {
    if (!style || typeof style === 'boolean') return {};
    if (typeof style === 'function') return (theme: Theme) => splitStyle(style(theme), layout);
    return splitStyle(style, layout);
  });
}

interface TooltipControlProps {
  title?: string;
  children?: ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  'aria-label'?: string;
}

function withActionTooltip<C extends ElementType>(Component: C, iconOnly = false): C {
  const Control = Component as ElementType;
  const ActionControl = forwardRef<HTMLElement, TooltipControlProps>(function ActionControl(
    { title, sx, ...props }, ref,
  ) {
    const showTooltip = Boolean(title && (iconOnly || props.disabled));
    const button = <Control {...props} ref={ref}
      aria-label={props['aria-label'] ?? (iconOnly ? title : undefined)}
      sx={props.disabled && showTooltip ? splitSx(sx, false) : sx} />;
    if (!showTooltip) return button;

    return <Tooltip title={title} arrow describeChild>
      {props.disabled
        ? <Box component="span" tabIndex={0} aria-label={props['aria-label'] ?? title} aria-disabled sx={[
          { display: 'inline-flex', ...(props.fullWidth && { width: '100%' }),
            '& > .MuiButtonBase-root': { width: '100%', height: '100%' } },
          ...splitSx(sx, true),
        ]}>{button}</Box>
        : button}
    </Tooltip>;
  });
  // Preserve MUI's polymorphic component, link and ref overloads.
  return ActionControl as unknown as C;
}

/** Visible labels explain enabled controls; icons and disabled controls retain hints. */
export const Button = withActionTooltip(MuiButton);
export const IconButton = withActionTooltip(MuiIconButton, true);
export const Tab = withActionTooltip(MuiTab);
export const ToggleButton = withActionTooltip(MuiToggleButton);
export const ListItemButton = withActionTooltip(MuiListItemButton);
export const BottomNavigationAction = withActionTooltip(MuiBottomNavigationAction);
export const AccordionSummary = withActionTooltip(MuiAccordionSummary);
export const Chip = withActionTooltip(MuiChip);
export const MenuItem = withActionTooltip(MuiMenuItem);
