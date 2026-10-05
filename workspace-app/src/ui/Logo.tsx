import { useId } from "react";

/**
 * Brand mark: a hand-drawn stroke on the accent gradient. Each instance owns
 * its gradient id: a shared id breaks when the first copy sits inside a
 * `display: none` container (the gradient then renders nothing anywhere).
 */
export const Logo = ({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) => {
  const gradId = `ew-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Excalidraw Workspace"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="3"
          y1="2"
          x2="29"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7d79ff" />
          <stop offset="1" stopColor="#d77bd0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradId})`} />
      <path
        d="M8.5 21.5c1.2-6.2 3.4-9.4 5.6-8.6 2.4.9-.8 6.4 1.7 7 2 .5 3.6-4.3 7.7-9.4"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="24.4" cy="9.4" r="1.7" fill="#fff" />
    </svg>
  );
};
