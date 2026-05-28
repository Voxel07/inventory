import { useState, useRef, useEffect } from 'react';
import { Box, Button, Typography, Alert, Tooltip } from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

interface Props {
    onScan: (data: string) => void;
}

export function QRCodeScanner({ onScan }: Props) {
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    async function startScanning() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setScanning(true);
            setError('');
        } catch {
            setError('Zugriff auf Kamera nicht möglich. Bitte überprüfen Sie die Berechtigungen.');
        }
    }

    function stopScanning() {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setScanning(false);
    }

    // Manual input fallback for environments without camera
    function handleManualInput() {
        const id = window.prompt('Geben Sie die Artikel-ID oder die Scan-URL ein:');
        if (id) {
            // Extract item ID from URL if full URL pasted
            const match = id.match(/\/checkout\/(.+)$/);
            onScan(match ? match[1] : id);
        }
    }

    return (
        <Box sx={{ textAlign: 'center' }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {scanning ? (
                <Box>
                    <video
                        ref={videoRef}
                        style={{ width: '100%', maxWidth: 400, borderRadius: 8 }}
                    />
                    <Box sx={{ mt: 2 }}>
                        <Tooltip title="Kamera stoppen und Scannen abbrechen" arrow>
                            <span>
                                <Button variant="outlined" color="error" onClick={stopScanning}>
                                    Scannen stoppen
                                </Button>
                            </span>
                        </Tooltip>
                    </Box>
                </Box>
            ) : (
                <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Scannen Sie einen QR-Code, um einen Artikel schnell auszuleihen oder anzuzeigen.
                    </Typography>
                    <Tooltip title="Auf Kamera zugreifen, um QR-Codes zu scannen" arrow>
                        <span>
                            <Button
                                variant="contained"
                                startIcon={<CameraAltIcon />}
                                onClick={startScanning}
                                sx={{ mr: 1 }}
                            >
                                Kamera starten
                            </Button>
                        </span>
                    </Tooltip>
                    <Tooltip title="Artikel- oder Scan-ID manuell eingeben" arrow>
                        <span>
                            <Button variant="outlined" onClick={handleManualInput}>
                                ID manuell eingeben
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
            )}
        </Box>
    );
}
