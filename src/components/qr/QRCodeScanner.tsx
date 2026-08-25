import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import type { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';

interface Props { onScan: (data: string) => void }

export function QRCodeScanner({ onScan }: Props) {
    const [scanning, setScanning] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState('');
    const [manualValue, setManualValue] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const readerRef = useRef<BrowserQRCodeReader | null>(null);

    async function getReader() {
        if (!readerRef.current) {
            const { BrowserQRCodeReader: QRReader } = await import('@zxing/browser');
            readerRef.current = new QRReader(undefined, { delayBetweenScanAttempts: 150 });
        }
        return readerRef.current;
    }

    function stopScanning() {
        controlsRef.current?.stop();
        controlsRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setScanning(false);
        setStarting(false);
    }

    useEffect(() => () => {
        controlsRef.current?.stop();
        streamRef.current?.getTracks().forEach((track) => track.stop());
    }, []);

    async function startScanning() {
        stopScanning();
        setError('');
        setScanning(true);
        setStarting(true);
        try {
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
                throw new Error('Kamerazugriff benötigt HTTPS und einen unterstützten Browser');
            }
            const video = videoRef.current;
            if (!video) throw new Error('Camera preview is unavailable');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            video.srcObject = stream;
            await video.play();
            setStarting(false);
            const reader = await getReader();
            controlsRef.current = await reader.decodeFromStream(
                stream,
                video,
                (result) => {
                    if (!result) return;
                    const value = result.getText();
                    stopScanning();
                    onScan(value);
                },
            );
        } catch (cause) {
            stopScanning();
            setError(cause instanceof Error
                ? `Kamera konnte nicht gestartet werden: ${cause.message}`
                : 'Kamera konnte nicht gestartet werden. Bitte Berechtigungen und HTTPS prüfen.');
        }
    }

    async function scanImage(file: File) {
        stopScanning();
        setError('');
        const url = URL.createObjectURL(file);
        try {
            const reader = await getReader();
            const result = await reader.decodeFromImageUrl(url);
            onScan(result.getText());
        } catch {
            setError('Im ausgewählten Bild wurde kein lesbarer QR-Code gefunden.');
        } finally {
            URL.revokeObjectURL(url);
            if (fileRef.current) fileRef.current.value = '';
        }
    }

    function submitManual() {
        if (manualValue.trim()) onScan(manualValue.trim());
    }

    return <Box sx={{ textAlign: 'center' }}>
        {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ position: 'relative', display: scanning ? 'block' : 'none', maxWidth: 480, mx: 'auto' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            {starting && <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,.45)', borderRadius: 3 }}><CircularProgress /></Box>}
        </Box>
        <Box sx={{ my: 2, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {scanning
                ? <Button variant="outlined" color="error" onClick={stopScanning}>Scannen stoppen</Button>
                : <Button variant="contained" size="large" startIcon={<CameraAltIcon />} onClick={() => void startScanning()}>QR-Code scannen</Button>}
            <Button variant="outlined" startIcon={<ImageSearchIcon />} onClick={() => fileRef.current?.click()}>Bild auswählen</Button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void scanImage(file);
            }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Alternativ Artikel-ID oder QR-Link einfügen</Typography>
        <Box sx={{ display: 'flex', gap: 1, maxWidth: 520, mx: 'auto' }}>
            <TextField size="small" fullWidth value={manualValue} onChange={(e) => setManualValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitManual()} label="ID oder QR-Link" />
            <Button variant="outlined" onClick={submitManual} disabled={!manualValue.trim()}>Öffnen</Button>
        </Box>
    </Box>;
}
