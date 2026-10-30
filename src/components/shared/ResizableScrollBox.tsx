import { Box, type BoxProps } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

const MIN_HEIGHT = 120;

function storedHeight(key: string, fallback: number): number {
  try {
    const value = Number(window.localStorage.getItem(key));
    return value >= MIN_HEIGHT ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Scroll area with a fixed height from the sm breakpoint up, so filtering never shifts the layout.
 * Users drag the bottom edge to resize it; the height is remembered per device under {@code storageKey}.
 */
export function ResizableScrollBox({ storageKey, defaultHeight, sx, ...props }: BoxProps & { storageKey: string; defaultHeight: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height] = useState(() => storedHeight(storageKey, defaultHeight));
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      // Phones show the full list without a resize handle; only remember sizes the user can set.
      if (getComputedStyle(element).resize === 'none') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = Math.round(element.getBoundingClientRect().height);
        if (next < MIN_HEIGHT) return;
        try { window.localStorage.setItem(storageKey, String(next)); } catch { /* a per-device convenience only */ }
      }, 200);
    });
    observer.observe(element);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [storageKey]);
  return <Box ref={ref} {...props} sx={[{
    boxSizing: 'border-box',
    height: { xs: 'auto', sm: height },
    minHeight: { sm: MIN_HEIGHT },
    overflowY: { xs: 'visible', sm: 'auto' },
    resize: { xs: 'none', sm: 'vertical' },
    alignContent: 'start',
    pr: 0.5,
  }, ...(Array.isArray(sx) ? sx : [sx])]} />;
}
