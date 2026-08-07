import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import './LiveChart.css';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="live-chart__tooltip">
      <div className="live-chart__tooltip-time mono">{formatTime(label)}</div>
      <div className="live-chart__tooltip-value mono">{payload[0].value} events</div>
    </div>
  );
}

export function LiveChart({ data }) {
  return (
    <div className="live-chart">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={formatTime}
            stroke="var(--text-dim)"
            tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            minTickGap={40}
          />
          <YAxis
            stroke="var(--text-dim)"
            tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-bright)' }} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#pulseFill)"
            isAnimationActive={true}
            animationDuration={400}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
