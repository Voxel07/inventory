import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { translate } from '../utils/naming';

import { resolveScannedCode } from '../utils/codeResolver';

const MAX_KEY_INTERVAL_MS = 65;
const MIN_SCAN_LENGTH = 3;

export function useBarcodeScanner(enabled = true) {
  const navigate = useNavigate();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (event.key === 'Enter') {
        const scanned = bufferRef.current.trim();
        bufferRef.current = '';

        if (scanned.length >= MIN_SCAN_LENGTH) {
          if (!isInputFocused || interval < MAX_KEY_INTERVAL_MS) {
            event.preventDefault();
            void handleScannedCode(scanned);
          }
        }
        return;
      }

      if (event.key.length === 1) {
        if (interval > MAX_KEY_INTERVAL_MS) {
          bufferRef.current = event.key;
        } else {
          bufferRef.current += event.key;
        }
      }
    }

    async function handleScannedCode(code: string) {
      const scanEvent = new CustomEvent('ash-barcode-scanned', { detail: { code }, cancelable: true });
      window.dispatchEvent(scanEvent);
      if (scanEvent.defaultPrevented) return;

      try {
        const result = await resolveScannedCode(code);
        if (result.found && result.path) {
          showSnackbar(
            translate(
              `Scancode erkannt: ${result.name || result.code} geöffnet`,
              `Scan code detected: opening ${result.name || result.code}`,
            ),
            'info',
          );
          navigate(result.path);
          return;
        }
      } catch {
        // Ignore resolution errors
      }

      showSnackbar(translate(`Scancode gelesen: ${code}`, `Scan code read: ${code}`), 'info');
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, navigate, showSnackbar]);
}
