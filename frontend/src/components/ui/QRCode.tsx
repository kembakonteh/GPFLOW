import { QRCodeSVG } from "qrcode.react";

interface Props {
  value: string;
  size?: number;
  color?: string;
  bg?: string;
}

export default function QRCode({ value, size = 120, color = "#000", bg = "#fff" }: Props) {
  return (
    <QRCodeSVG
      value={value || " "}
      size={size}
      fgColor={color}
      bgColor={bg}
    />
  );
}
