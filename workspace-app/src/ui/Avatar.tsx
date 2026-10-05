import { useEffect, useState } from "react";

const hueOf = (s: string) => {
  let h = 0;
  for (const c of s) {
    h = (h * 31 + c.charCodeAt(0)) % 360;
  }
  return h;
};

/**
 * Profile picture with a graceful fallback: if there is no photo, or it fails
 * to load (e.g. a signed-out guest cannot fetch avatars), show a coloured
 * initial instead of a broken image.
 */
export const Avatar = ({
  name,
  src,
  size = 32,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = [...name.trim()][0]?.toUpperCase() ?? "?";
  const h = hueOf(name || "?");
  return (
    <span
      className={`ui-avatar ${className}`}
      role="img"
      aria-label={name}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `linear-gradient(135deg, hsl(${h} 62% 52%), hsl(${
          (h + 38) % 360
        } 68% 62%))`,
      }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
};
