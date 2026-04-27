import { C } from "../../lib/tokens";

interface Props {
  done: number;
  total: number;
  color: string;
}

export default function ProgressBar({ done, total, color }: Props) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.textSub, fontWeight: 600 }}>{done} of {total} done</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: C.border, borderRadius: 4, height: 8 }}>
        <div style={{
          width: `${pct}%`,
          background: color,
          height: "100%",
          borderRadius: 4,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}
