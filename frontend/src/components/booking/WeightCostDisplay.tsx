/**
 * Shared weight+cost display for BookingConfirmedPage and TrackingPage Details tab.
 * Shows estimated state before weigh-in, confirmed state after.
 */

const KG_TO_LB = 2.20462;

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function kgToDisplay(kg: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') return `${(kg * KG_TO_LB).toFixed(2)} lbs`;
  return `${kg.toFixed(3)} kg`;
}

interface Props {
  estimatedKg:   number;
  confirmedKg?:  number | null;
  currency:      string;
  ratePerKg?:    number;  // used for live cost calc when no display string
  unit:          'kg' | 'lbs';
  estimatedCostDisplay?: string | null;
  confirmedCostDisplay?: string | null;
}

export default function WeightCostDisplay({
  estimatedKg,
  confirmedKg,
  currency,
  ratePerKg,
  unit,
  estimatedCostDisplay,
  confirmedCostDisplay,
}: Props) {
  const isConfirmed = confirmedKg != null && confirmedKg > 0;

  const estCostStr  = estimatedCostDisplay  ?? (ratePerKg ? fmt(estimatedKg * ratePerKg, currency)  : null);
  const confCostStr = confirmedCostDisplay  ?? (ratePerKg && confirmedKg ? fmt(confirmedKg * ratePerKg, currency) : null);

  if (isConfirmed) {
    return (
      <div className="space-y-3">
        {/* Weight confirmed */}
        <div className="flex items-center justify-between py-3 border-b border-line">
          <div>
            <p className="text-xs text-sub uppercase tracking-wide mb-0.5">Weight</p>
            <p className="text-xl font-bold text-accent">
              {kgToDisplay(confirmedKg!, unit)}
              {unit === 'lbs' && (
                <span className="text-sm font-normal text-sub ml-1.5">
                  ({confirmedKg!.toFixed(3)} kg)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 rounded-lg px-2.5 py-1.5">
            <span className="text-accent text-xs font-semibold">✓ Confirmed</span>
          </div>
        </div>

        {/* Cost confirmed */}
        {confCostStr && (
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-xs text-sub uppercase tracking-wide mb-0.5">Final cost</p>
              <p className="text-xl font-bold text-accent">{confCostStr}</p>
            </div>
            {estCostStr && estCostStr !== confCostStr && (
              <p className="text-xs text-dim line-through">{estCostStr} est.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Before weigh-in
  return (
    <div className="space-y-3">
      {/* Estimated weight */}
      <div className="flex items-center justify-between py-3 border-b border-line">
        <div>
          <p className="text-xs text-sub uppercase tracking-wide mb-0.5">Weight</p>
          <p className="text-xl font-bold text-gold">
            ~{kgToDisplay(estimatedKg, unit)}
          </p>
          <p className="text-xs text-sub mt-0.5">estimate only</p>
        </div>
        <div className="flex items-center gap-1.5 bg-gold/10 border border-gold/30 rounded-lg px-2.5 py-1.5">
          <span className="text-gold text-xs font-medium">⏳ Pending weigh-in</span>
        </div>
      </div>

      {/* Estimated cost */}
      {estCostStr && (
        <div className="py-2">
          <p className="text-xs text-sub uppercase tracking-wide mb-0.5">Estimated cost</p>
          <p className="text-xl font-bold text-gold">~{estCostStr}</p>
          <p className="text-xs text-dim mt-1">
            ⚖️ Not yet weighed. Final cost confirmed at drop-off after operator weighs your item on a calibrated scale.
          </p>
        </div>
      )}
    </div>
  );
}
