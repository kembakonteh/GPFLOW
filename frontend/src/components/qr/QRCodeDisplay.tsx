import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  value:  string;
  size?:  number;
  className?: string;
}

/**
 * Renders a QR code SVG for the given value (tracking URL).
 * Uses qrcode.react — no canvas, no external service.
 */
export default function QRCodeDisplay({ value, size = 160, className = '' }: QRCodeDisplayProps) {
  return (
    <div
      className={`inline-flex items-center justify-center bg-white rounded-xl p-3 ${className}`}
      style={{ width: size + 24, height: size + 24 }}
    >
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin={false}
        fgColor="#000000"
        bgColor="#ffffff"
      />
    </div>
  );
}
