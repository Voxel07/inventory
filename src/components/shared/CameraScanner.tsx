import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Stack } from '@mui/material';
import { translate, useLocalizedText } from '../../utils/naming';

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = { new(options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const t = useLocalizedText();
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  useEffect(() => { callback.current = onScan; }, [onScan]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!running) return;
    let stopped = false; let stream: MediaStream | undefined; let timer: ReturnType<typeof setTimeout>;
    const stop = () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
    const hidden = () => { if (document.hidden) { stop(); setRunning(false); } };
    document.addEventListener('visibilitychange', hidden);
    void (async () => {
      try {
        const Constructor = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
        if (!Constructor || !navigator.mediaDevices?.getUserMedia) throw new Error(translate('Kamera-Scannen wird hier nicht unterstützt. Code unten eingeben oder einen Scanner verwenden.', 'Camera scanning is not supported here. Enter the code below or use a handheld scanner.'));
        const formats = await Constructor.getSupportedFormats();
        if (!formats.includes('qr_code')) throw new Error(translate('Dieser Browser kann keine QR-Codes erkennen.', 'This browser cannot detect QR codes.'));
        const detector = new Constructor({ formats });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
        if (!video.current) { stop(); return; }
        video.current.srcObject = stream; await video.current.play();
        const read = async () => {
          if (stopped) return;
          try {
            const result = video.current && video.current.readyState >= 2 ? await detector.detect(video.current) : [];
            if (stopped) return;
            const code = result[0]?.rawValue;
            if (code) { stop(); setRunning(false); callback.current(code); return; }
          } catch { /* A frame can become unavailable while focusing; try the next frame. */ }
          if (!stopped) timer = setTimeout(() => void read(), 250);
        };
        void read();
      } catch (e) {
        if (!stopped) { stop(); setRunning(false); setError(e instanceof Error ? e.message : translate('Kamera nicht verfügbar.', 'Camera unavailable.')); }
      }
    })();
    return () => { stop(); document.removeEventListener('visibilitychange', hidden); };
  }, [running]);
  return <Stack spacing={1} sx={{ mb: 2 }}>
    {error && <Alert severity="warning">{error}</Alert>}
    {running && <Box component="video" ref={video} muted playsInline aria-label={t('Kameravorschau', 'Camera preview')} sx={{ width: '100%', maxHeight: 300, bgcolor: 'black' }} />}
    <Button type="button" variant="outlined" onClick={() => { setError(''); setRunning(!running); }}>{running ? t('Kamera stoppen', 'Stop camera') : t('Mit Kamera scannen', 'Scan with camera')}</Button>
  </Stack>;
}
