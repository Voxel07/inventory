import React, { useRef } from 'react';
import QRCode from 'react-qr-code';

function QRGenerator({ value }) {
  const qrRef = useRef(null);

  const downloadQRCode = () => {
    if (qrRef.current) {
      const svg = qrRef.current.querySelector('svg');

      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'qr_code.png'; // Choose your filename
              link.click();
              URL.revokeObjectURL(url); // Clean up the URL object
            }
          });
        };
        img.src = `data:image/svg+xml;base64,${window.btoa(svgData)}`;
      }
    }
  };

  return (
    <div>
      <div ref={qrRef}>
        <QRCode value={value} size={256}  /> {/* Adjust size as needed */}
      </div>
      <button onClick={downloadQRCode}>Download QR Code</button>
    </div>
  );
}

export default QRGenerator;