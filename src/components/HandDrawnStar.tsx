type Props = { size?: number; className?: string; strokeWidth?: number };

export function HandDrawnStar({ size = 48, className, strokeWidth = 2 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32 4 L36 24 L56 22 L40 34 L48 54 L32 42 L16 54 L24 34 L8 22 L28 24 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M32 14 L33 22 M50 28 L42 32 M40 46 L36 38 M24 46 L28 38 M14 28 L22 32"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.6}
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
