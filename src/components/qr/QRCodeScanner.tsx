import { useState, useRef, useEffect } from 'react';
import { Box, Button, Typography, Alert } from '@mui/material';
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
            setError('Unable to access camera. Please check permissions.');
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
        const id = window.prompt('Enter item ID or scan URL:');
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
                        <Button variant="outlined" color="error" onClick={stopScanning}>
                            Stop Scanning
                        </Button>
                    </Box>
                </Box>
            ) : (
                <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Scan a QR code to quickly check out or view an item.
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<CameraAltIcon />}
                        onClick={startScanning}
                        sx={{ mr: 1 }}
                    >
                        Start Camera
                    </Button>
                    <Button variant="outlined" onClick={handleManualInput}>
                        Enter ID Manually
                    </Button>
                </Box>
            )}
        </Box>
    );
}
