"use client";

/**
 * Ambient "reactor core" backdrop for the fact-checking workspace.
 *
 * Purely decorative: aria-hidden, pointer-transparent, sits behind every
 * panel, and freezes under the global prefers-reduced-motion rule in
 * globals.css. Geometry comes from seeded PRNGs at module scope so SSR and
 * client emit identical markup (no hydration drift).
 */

const AMBER = "#FFB400";
const ORANGE = "#FF8A00";
const BURNT = "#993300";
const DEPTH = "#1A0000";

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/* --- depth plane 4: background support field (slow drift 80–300s) ------ */

type BgItem =
  | {
      kind: "ellipse";
      rx: number;
      ry: number;
      rot: number;
      dur: number;
      rev: boolean;
      color: string;
      width: number;
      opacity: number;
    }
  | {
      kind: "arc";
      r: number;
      dash: number;
      circ: number;
      rot: number;
      dur: number;
      rev: boolean;
      color: string;
      width: number;
      opacity: number;
    }
  | {
      kind: "pair";
      r: number;
      gap: number;
      rot: number;
      dur: number;
      rev: boolean;
      color: string;
      width: number;
      opacity: number;
    };

const BG_FIELD: BgItem[] = (() => {
  const rnd = mulberry32(0x5eed01);
  const items: BgItem[] = [];
  for (let i = 0; i < 56; i++) {
    const roll = rnd();
    const dur = 80 + rnd() * 220;
    const rev = rnd() > 0.5;
    if (roll < 0.4) {
      items.push({
        kind: "ellipse",
        rx: 200 + rnd() * 150,
        ry: 50 + rnd() * 130,
        rot: rnd() * 180,
        dur,
        rev,
        color: rnd() > 0.45 ? DEPTH : BURNT,
        width: 0.5 + rnd() * 0.8,
        opacity: 0.16 + rnd() * 0.14,
      });
    } else if (roll < 0.75) {
      const r = 120 + rnd() * 360;
      const circ = 2 * Math.PI * r;
      const frac = 0.6 + rnd() * 0.25;
      items.push({
        kind: "arc",
        r,
        dash: frac * circ,
        circ,
        rot: rnd() * 360,
        dur,
        rev,
        color: rnd() > 0.4 ? DEPTH : BURNT,
        width: 0.6 + rnd() * 0.8,
        opacity: 0.2 + rnd() * 0.15,
      });
    } else {
      items.push({
        kind: "pair",
        r: 100 + rnd() * 380,
        gap: 3 + rnd() * 3,
        rot: rnd() * 360,
        dur,
        rev,
        color: rnd() > 0.7 ? BURNT : DEPTH,
        width: 0.5,
        opacity: 0.2 + rnd() * 0.1,
      });
    }
  }
  return items;
})();

/* --- depth plane 3: radial trace field (38 irregular spokes) ----------- */

const SPOKES = (() => {
  const rnd = mulberry32(0x5eed02);
  const lengths = [150, 250, 320];
  const widths = [0.5, 1, 1.5];
  const spokes: {
    x2: number;
    y2: number;
    width: number;
    color: string;
    opacity: number;
  }[] = [];
  let angle = rnd() * 360;
  for (let i = 0; i < 38; i++) {
    const roll = rnd();
    const len = lengths[Math.floor(rnd() * lengths.length)];
    spokes.push({
      x2: 500 + len * Math.cos(rad(angle)),
      y2: 500 + len * Math.sin(rad(angle)),
      width: widths[Math.floor(rnd() * widths.length)],
      color: roll < 0.2 ? AMBER : roll < 0.5 ? ORANGE : BURNT,
      opacity: 0.2 + rnd() * 0.45,
    });
    angle = (angle + 8 + rnd() * 14) % 360; // 8°–22° gaps, no robotic symmetry
  }
  return spokes;
})();

/* --- depth plane 2: peripheral satellite network (48 nodes) ------------ */

type SatKind = "stem" | "target" | "half";

interface Satellite {
  x: number;
  y: number;
  size: number;
  kind: SatKind;
  orbiting: boolean;
  pulsing: boolean;
  color: string;
}

const SATELLITES: Satellite[] = (() => {
  const rnd = mulberry32(0x5eed03);
  const kinds: SatKind[] = ["stem", "target", "half"];
  const nodes: Satellite[] = [];
  for (let i = 0; i < 48; i++) {
    const a = rnd() * 360;
    const r = 320 + rnd() * 160;
    const colorRoll = rnd();
    nodes.push({
      x: 500 + r * Math.cos(rad(a)),
      y: 500 + r * Math.sin(rad(a)),
      size: 2 + rnd() * 6,
      kind: kinds[Math.floor(rnd() * kinds.length)],
      orbiting: i < 28,
      pulsing: i % 8 === 3, // six pulsing nodes spread across both groups
      color: colorRoll < 0.3 ? AMBER : colorRoll < 0.6 ? ORANGE : BURNT,
    });
  }
  return nodes;
})();

/* --- depth plane 1: inner shutter ring fixtures ------------------------ */

const SHUTTERS = [
  { deg: 30, w: 8, h: 10 },
  { deg: 60, w: 6, h: 12 },
  { deg: 90, w: 8, h: 10 },
  { deg: 155, w: 6, h: 12 },
  { deg: 238, w: 8, h: 10 },
  { deg: 305, w: 6, h: 12 },
];

/* --- technical annotations --------------------------------------------- */

const LABELS = [
  { x: 40, y: 44, text: "RAG-FACT-CHECK // VERIFICATION CORE", fill: ORANGE, size: 11 },
  { x: 40, y: 62, text: "TOPIC: FACT-CHECKING-AI-USING-RAG", fill: BURNT, size: 10 },
  { x: 812, y: 800, text: "CLAIM-EXTRACTION", fill: ORANGE, size: 10 },
  { x: 84, y: 240, text: "EVIDENCE-RETRIEVAL", fill: ORANGE, size: 10 },
  { x: 712, y: 150, text: "VERDICT-SCORING", fill: BURNT, size: 10 },
  { x: 108, y: 824, text: "SOURCE-GROUNDING", fill: BURNT, size: 10 },
  { x: 664, y: 524, text: "θ35° RX450/RY180", fill: BURNT, size: 9 },
  { x: 556, y: 352, text: "R130 SHUTTER-RING", fill: BURNT, size: 9 },
];

function SatelliteNode({ n }: { n: Satellite }) {
  const cls = n.pulsing ? "rfc-pulse" : undefined;
  const glow = n.pulsing ? "url(#rfc-glow-soft)" : undefined;
  switch (n.kind) {
    case "stem":
      return (
        <g className={cls} filter={glow}>
          <line
            x1={n.x - n.size - 8}
            y1={n.y}
            x2={n.x - n.size - 1}
            y2={n.y}
            stroke={n.color}
            strokeWidth={0.8}
            opacity={0.7}
          />
          <circle cx={n.x} cy={n.y} r={n.size / 2} fill={n.color} />
        </g>
      );
    case "target":
      return (
        <g className={cls} filter={glow}>
          <circle
            cx={n.x}
            cy={n.y}
            r={n.size / 2 + 1.5}
            fill="none"
            stroke={n.color}
            strokeWidth={0.8}
          />
          <circle cx={n.x} cy={n.y} r={1} fill={n.color} />
        </g>
      );
    case "half": {
      const r = n.size / 2 + 1;
      const c = 2 * Math.PI * r;
      return (
        <circle
          className={cls}
          filter={glow}
          cx={n.x}
          cy={n.y}
          r={r}
          fill="none"
          stroke={n.color}
          strokeWidth={1}
          strokeDasharray={`${c / 2} ${c / 2}`}
        />
      );
    }
  }
}

export function ReactorBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[0.14] transition-opacity duration-500 dark:opacity-100"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="rfc-glow-soft" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rfc-glow-core" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* plane 4 — background support field */}
        <g>
          {BG_FIELD.map((item, i) => (
            <g
              key={i}
              className="rfc-origin rfc-drift"
              style={{
                animationDuration: `${item.dur}s`,
                animationDirection: item.rev ? "reverse" : "normal",
              }}
            >
              {item.kind === "ellipse" && (
                <ellipse
                  cx={500}
                  cy={500}
                  rx={item.rx}
                  ry={item.ry}
                  transform={`rotate(${item.rot} 500 500)`}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={item.width}
                  opacity={item.opacity}
                />
              )}
              {item.kind === "arc" && (
                <circle
                  cx={500}
                  cy={500}
                  r={item.r}
                  transform={`rotate(${item.rot} 500 500)`}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={item.width}
                  strokeDasharray={`${item.dash} ${item.circ - item.dash}`}
                  opacity={item.opacity}
                />
              )}
              {item.kind === "pair" && (
                <g
                  transform={`rotate(${item.rot} 500 500)`}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={item.width}
                  opacity={item.opacity}
                >
                  <circle cx={500} cy={500} r={item.r} />
                  <circle cx={500} cy={500} r={item.r + item.gap} />
                </g>
              )}
            </g>
          ))}
        </g>

        {/* plane 3 — static radial trace field */}
        <g>
          {SPOKES.map((s, i) => (
            <line
              key={i}
              x1={500}
              y1={500}
              x2={s.x2}
              y2={s.y2}
              stroke={s.color}
              strokeWidth={s.width}
              opacity={s.opacity}
            />
          ))}
        </g>

        {/* plane 2 — satellites: 28 orbiting (200s), 20 static */}
        <g className="rfc-origin rfc-orbit-sat">
          {SATELLITES.filter((n) => n.orbiting).map((n, i) => (
            <SatelliteNode key={i} n={n} />
          ))}
        </g>
        <g>
          {SATELLITES.filter((n) => !n.orbiting).map((n, i) => (
            <SatelliteNode key={i} n={n} />
          ))}
        </g>

        {/* plane 1 — dominant tilted orbit, gyroscopic sweep */}
        <g className="rfc-origin rfc-gyro">
          <ellipse
            cx={500}
            cy={500}
            rx={450}
            ry={180}
            fill="none"
            stroke={ORANGE}
            strokeWidth={2.5}
            strokeDasharray="400 600"
            opacity={0.8}
          />
          <ellipse
            cx={500}
            cy={500}
            rx={454}
            ry={184}
            fill="none"
            stroke={BURNT}
            strokeWidth={0.8}
            opacity={0.6}
          />
          <ellipse
            className="rfc-packet"
            cx={500}
            cy={500}
            rx={458}
            ry={188}
            fill="none"
            stroke={AMBER}
            strokeWidth={0.6}
            strokeDasharray="60 340"
            opacity={0.9}
          />
          {/* technical tick blocks at the horizontal extremes */}
          <g fill={AMBER} opacity={0.8}>
            <rect x={942} y={490} width={8} height={20} />
            <rect x={50} y={490} width={8} height={20} />
          </g>
        </g>

        {/* plane 0 — inner shutter ring (12s gyro sweep) */}
        <g className="rfc-origin rfc-ring">
          <circle
            cx={500}
            cy={500}
            r={130}
            fill="none"
            stroke={AMBER}
            strokeWidth={2}
            strokeDasharray="80 40"
            opacity={0.75}
          />
          {SHUTTERS.map((s, i) => {
            const x = 500 + 130 * Math.cos(rad(s.deg));
            const y = 500 + 130 * Math.sin(rad(s.deg));
            return (
              <rect
                key={i}
                className="rfc-shutter"
                style={{ animationDelay: `${i * 0.9}s` }}
                x={x - s.w / 2}
                y={y - s.h / 2}
                width={s.w}
                height={s.h}
                fill={AMBER}
              />
            );
          })}
        </g>

        {/* central nucleus assembly — local trajectory + spin */}
        <g className="rfc-nucleus">
          <circle cx={500} cy={500} r={32} fill="#000000" stroke={BURNT} strokeWidth={1.5} />
          <circle
            cx={500}
            cy={500}
            r={20}
            fill="none"
            stroke={ORANGE}
            strokeWidth={0.5}
            opacity={0.5}
          />
          <circle cx={500} cy={500} r={4.5} fill={AMBER} filter="url(#rfc-glow-core)" />
        </g>

        {/* technical annotations — JetBrains Mono */}
        <g fontFamily={MONO} letterSpacing={1}>
          {LABELS.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={l.y}
              fontSize={l.size}
              fill={l.fill}
              opacity={l.size >= 11 ? 0.55 : 0.45}
              fontWeight={l.size >= 11 ? 500 : 300}
            >
              {l.text}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}