import './PulseMark.css';

/**
 * The signature element: an EKG-style trace that draws itself in a loop.
 * Used small as the wordmark's icon, and larger as the live-status glyph
 * next to the WebSocket connection indicator.
 */
export function PulseMark({ size = 22, live = true }) {
  return (
    <svg
      width={size}
      height={size * 0.5}
      viewBox="0 0 64 32"
      fill="none"
      className={`pulse-mark ${live ? 'pulse-mark--live' : ''}`}
      aria-hidden="true"
    >
      <path
        d="M0 16 H16 L21 4 L27 28 L33 12 L37 20 L41 16 H64"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className="pulse-mark__path"
      />
    </svg>
  );
}
