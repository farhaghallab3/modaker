import type { SVGProps } from "react";

/**
 * Hand-tuned line icon set (1.6 stroke, 24 grid). Directional icons are drawn
 * for LTR and mirrored automatically in RTL via `rtl:-scale-x-100`, so
 * "forward" always points in the reading direction.
 */
const PATHS = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  mushaf: "M12 6.5C10 5 7.2 4.6 4 5v13c3.2-.4 6 0 8 1.5M12 6.5c2-1.5 4.8-1.9 8-1.5v13c-3.2-.4-6 0-8 1.5M12 6.5v13",
  mic: "M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Zm-6.5-4a6.5 6.5 0 0 0 13 0M12 17.5V21m-3.5 0h7",
  micOff: "M15.5 9.5v-3a3.5 3.5 0 0 0-6.6-1.6M8.5 9v2.5a3.5 3.5 0 0 0 5.6 2.8M5.5 11a6.5 6.5 0 0 0 10.9 4.8M18.5 11c0 .7-.1 1.4-.3 2M12 17.5V21m-3.5 0h7M4 4l16 16",
  review: "M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15m0 4.5V15H9",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  grid: "M4.5 4.5h6v6h-6zm9 0h6v6h-6zm-9 9h6v6h-6zm9 0h6v6h-6z",
  bell: "M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  chart: "M4.5 19.5h15M7 16v-4m5 4V8m5 8v-6",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8a7.5 7.5 0 0 1 15 0",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M8 5.5v13m8-13v13",
  stop: "M7 7h10v10H7z",
  bookmark: "M7 4.5h10v15l-5-3.5-5 3.5z",
  check: "M5 12.5 10 17.5 19 7",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.8-9 2.6 2.6 5-5.2",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.6M6.3 6.8C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  repeat: "M17 3.5 20 6.5 17 9.5M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5 4 17.5 7 14.5M20 12.5v1a4 4 0 0 1-4 4H4",
  forward: "M9 5.5 15.5 12 9 18.5",
  back: "M15 5.5 8.5 12 15 18.5",
  arrowForward: "M4.5 12h15m-6-6.5 6.5 6.5-6.5 6.5",
  search: "M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm5.3-2.2L20.5 20.5",
  x: "M6 6l12 12M18 6 6 18",
  send: "M4.5 12 20 4.5 15.5 20l-3.2-6.3zm7.8 1.7L20 4.5",
  video: "M4 6.5h11v11H4zm11 4 5-3v9l-5-3",
  scroll: "M8 4.5h10.5a2 2 0 0 1 0 4H17M8 4.5a2 2 0 0 0-2 2v11a2 2 0 0 1-2 2h11.5a2 2 0 0 0 2-2V8.5M8 4.5a2 2 0 0 1 2 2v0M10 12h5m-5 3.5h5",
  leaf: "M5 19c0-8 5.5-13.5 14-14 0 8.5-5.5 14-13 14m-1 0c2.5-4 5.5-6.5 9-8",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2",
  alert: "M12 9v4.5m0 3h.01M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5.5M12 7.8h.01",
  wifiOff: "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.3-2.5M14.6 10.6A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.2-2.7M11 5.6a15 15 0 0 1 11 3.9M12 20h.01",
  chat: "M4.5 18.5V6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5zM8.5 9.5h7m-7 3.5h4.5",
  lamp: "M9.5 18.5h5M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z",
  book: "M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2zm0 13a2 2 0 0 1 2-2h11.5",
  quote: "M9.5 7.5H6v5h3.5v.5c0 1.5-1 3-3 3.5m11-9H14v5h3.5v.5c0 1.5-1 3-3 3.5",
  flame: "M12 21c3.6 0 6-2.5 6-6 0-4-3.5-6-4-10-2.5 1.5-4 4-4 6.5-1-.7-1.7-1.8-2-3-1.3 1.5-2 3.6-2 6.5 0 3.5 2.4 6 6 6Z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  logout: "M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 16.5 5.5 12 10 7.5M5.5 12h10",
  trash: "M5 7h14M10 4.5h4M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.5h5.4a1.5 1.5 0 0 0 1.5-1.5L17 7",
  shield: "M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z",
  volume: "M5 9.5h3l4.5-4v13L8 14.5H5zm11 0a3.5 3.5 0 0 1 0 5m2.5-8a7 7 0 0 1 0 11",
  layers: "M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z",
  calendar: "M5 6.5h14v13H5zm0 4h14M9 4v4m6-4v4",
  menu: "M4 7h16M4 12h16M4 17h16",
} as const;

export type IconName = keyof typeof PATHS;

const DIRECTIONAL: Partial<Record<IconName, true>> = {
  forward: true,
  back: true,
  arrowForward: true,
  send: true,
};

const FILLED: Partial<Record<IconName, true>> = { play: true };

export function Icon({
  name,
  size = 20,
  className = "",
  title,
  ...rest
}: { name: IconName; size?: number; title?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const filled = FILLED[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={name === "more" ? 2.6 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={`shrink-0 ${DIRECTIONAL[name] ? "rtl:-scale-x-100" : ""} ${className}`}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
