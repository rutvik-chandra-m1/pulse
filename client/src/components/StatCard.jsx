import './StatCard.css';

export function StatCard({ label, value, delta, deltaLabel, accent = false }) {
  const isPositive = typeof delta === 'number' && delta > 0;
  const isNegative = typeof delta === 'number' && delta < 0;

  return (
    <div className={`stat-card ${accent ? 'stat-card--accent' : ''}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value mono">{value}</div>
      {typeof delta === 'number' && (
        <div
          className={`stat-card__delta ${isPositive ? 'stat-card__delta--up' : ''} ${
            isNegative ? 'stat-card__delta--down' : ''
          }`}
        >
          <span className="mono">
            {isPositive ? '+' : ''}
            {(delta * 100).toFixed(0)}%
          </span>
          {deltaLabel && <span className="stat-card__delta-label">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}
