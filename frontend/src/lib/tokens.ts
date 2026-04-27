export const C = {
  bg:           "#070D18",
  card:         "#0D1525",
  card2:        "#111D2E",
  border:       "#182236",
  accent:       "#00D4A0",
  accentDim:    "rgba(0,212,160,0.09)",
  accentBorder: "rgba(0,212,160,0.22)",
  gold:         "#F59E0B",
  goldDim:      "rgba(245,158,11,0.09)",
  goldBorder:   "rgba(245,158,11,0.22)",
  red:          "#F43F5E",
  redDim:       "rgba(244,63,94,0.09)",
  blue:         "#3B82F6",
  blueDim:      "rgba(59,130,246,0.09)",
  blueBorder:   "rgba(59,130,246,0.22)",
  purple:       "#8B5CF6",
  purpleDim:    "rgba(139,92,246,0.09)",
  purpleBorder: "rgba(139,92,246,0.22)",
  orange:       "#FB923C",
  orangeDim:    "rgba(251,146,60,0.09)",
  orangeBorder: "rgba(251,146,60,0.22)",
  teal:         "#06B6D4",
  tealDim:      "rgba(6,182,212,0.09)",
  tealBorder:   "rgba(6,182,212,0.22)",
  text:         "#EEF2FF",
  textSub:      "#8896AA",
  textDim:      "#3D4F63",
} as const;

export type CKey = keyof typeof C;

export const KG_TO_LB = 2.20462;

export function lbsToKg(lbs: number): number {
  return lbs / KG_TO_LB;
}

export function kgToLbs(kg: number): number {
  return kg * KG_TO_LB;
}

export function fmtLbs(lbs: number, decimals = 1): string {
  return `${lbs.toFixed(decimals)}lbs`;
}

export function fmtCost(amount: number, currency = "USD"): string {
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : "€";
  return `${sym}${amount.toFixed(2)}`;
}
