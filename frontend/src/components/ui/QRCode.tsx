interface Props {
  value: string;
  size?: number;
  color?: string;
  bg?: string;
}

export default function QRCode({ value, size = 120, color = "#000", bg = "#fff" }: Props) {
  const hash = value.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const modules = 21;
  const cell = size / modules;

  const cells: { r: number; c: number; dark: boolean }[] = [];
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      const inFinder = (r < 7 && c < 7) || (r < 7 && c >= modules - 7) || (r >= modules - 7 && c < 7);
      const timing = r === 6 || c === 6;
      const seed = ((hash ^ ((r * modules + c) * 2654435761)) >>> 0);
      const dark = inFinder || timing || seed % 3 === 0;
      cells.push({ r, c, dark });
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <rect width={size} height={size} fill={bg} />
      {cells.map(({ r, c, dark }) =>
        dark ? (
          <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={color} />
        ) : null
      )}
      {([[0, 0], [0, modules - 7], [modules - 7, 0]] as [number, number][]).map(([fr, fc]) => (
        <g key={`${fr}-${fc}`}>
          <rect x={fc * cell} y={fr * cell} width={7 * cell} height={7 * cell} fill="none" stroke={color} strokeWidth={cell} />
          <rect x={(fc + 2) * cell} y={(fr + 2) * cell} width={3 * cell} height={3 * cell} fill={color} />
        </g>
      ))}
    </svg>
  );
}
