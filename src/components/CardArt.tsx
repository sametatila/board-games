"use client";

import type { DevelopmentCard, Resource } from "@/game/types";

// Inline SVG illustrations for resource cards. Each one is a stylized scene
// drawn with vector primitives — no external assets, scales crisply at any
// size, and renders identically on all clients.

type ArtProps = { className?: string };

function WoodArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 100 130"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="wood-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fb86b" />
          <stop offset="100%" stopColor="#3a6f30" />
        </linearGradient>
        <linearGradient id="wood-tree-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f8a35" />
          <stop offset="100%" stopColor="#1c4516" />
        </linearGradient>
        <linearGradient id="wood-tree-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#52a544" />
          <stop offset="100%" stopColor="#2a5d24" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#wood-sky)" />
      {/* Distant tree row */}
      <g opacity="0.55">
        {[8, 24, 40, 56, 72, 88].map((x, i) => (
          <polygon
            key={i}
            points={`${x},80 ${x - 6},100 ${x + 6},100`}
            fill="#1d4118"
          />
        ))}
      </g>
      {/* Hill silhouette */}
      <path d="M 0,100 Q 50,82 100,100 L 100,130 L 0,130 Z" fill="#2c5524" />
      {/* Trunks */}
      <rect x="22" y="78" width="6" height="20" fill="#4a2f15" />
      <rect x="48" y="68" width="7" height="28" fill="#5a3a1a" />
      <rect x="74" y="80" width="5" height="18" fill="#4a2f15" />
      {/* Foliage — three layered triangles per tree */}
      <polygon points="25,62 12,82 38,82" fill="url(#wood-tree-a)" />
      <polygon points="25,72 16,86 34,86" fill="url(#wood-tree-b)" />
      <polygon points="51,46 32,72 70,72" fill="url(#wood-tree-a)" />
      <polygon points="51,58 38,76 64,76" fill="url(#wood-tree-b)" />
      <polygon points="76,64 64,82 88,82" fill="url(#wood-tree-a)" />
      <polygon points="76,72 67,86 85,86" fill="url(#wood-tree-b)" />
    </svg>
  );
}

function BrickArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 100 130"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="brick-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7a36a" />
          <stop offset="100%" stopColor="#a65626" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#brick-sky)" />
      {/* Ground */}
      <rect x="0" y="100" width="100" height="30" fill="#7a3818" />
      {/* Brick rows — staggered with mortar gaps */}
      {[0, 1, 2, 3].map((row) => {
        const y = 60 + row * 14;
        const offset = row % 2 === 0 ? 0 : 12;
        return (
          <g key={row}>
            {[0, 1, 2, 3, 4, 5].map((col) => {
              const x = -8 + offset + col * 22;
              const shade = ["#9c4222", "#8a3a1c", "#b15334", "#8a3a1c"][col % 4];
              return (
                <rect
                  key={col}
                  x={x}
                  y={y}
                  width="20"
                  height="11"
                  fill={shade}
                  stroke="#4a1a08"
                  strokeWidth="0.8"
                  rx="1"
                />
              );
            })}
          </g>
        );
      })}
      {/* Highlight on top brick */}
      <rect x="14" y="60" width="20" height="2" fill="#d97047" opacity="0.6" />
    </svg>
  );
}

function WheatArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 100 130"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="wheat-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe8a3" />
          <stop offset="100%" stopColor="#e8b04a" />
        </linearGradient>
        <linearGradient id="wheat-stalk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1bd" />
          <stop offset="100%" stopColor="#b5851d" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#wheat-sky)" />
      {/* Field rows */}
      {[80, 95, 110].map((y, i) => (
        <ellipse
          key={i}
          cx="50"
          cy={y}
          rx="120"
          ry="6"
          fill="#c08a1c"
          opacity={0.5 + i * 0.15}
        />
      ))}
      {/* Wheat stalks — clusters of 3 */}
      {[
        { x: 18, h: 36 },
        { x: 38, h: 44 },
        { x: 58, h: 40 },
        { x: 78, h: 48 },
      ].map((s, i) => {
        const top = 90 - s.h;
        return (
          <g key={i}>
            {/* Stalk */}
            <line x1={s.x} y1="100" x2={s.x} y2={top + 8} stroke="#a87015" strokeWidth="2" />
            {/* Head — diamond shape */}
            <ellipse cx={s.x} cy={top + 4} rx="3" ry="6" fill="url(#wheat-stalk)" />
            {/* Side grains */}
            <ellipse cx={s.x - 2} cy={top + 7} rx="1.5" ry="3" fill="#d9a52a" />
            <ellipse cx={s.x + 2} cy={top + 7} rx="1.5" ry="3" fill="#d9a52a" />
            <ellipse cx={s.x - 2} cy={top + 1} rx="1.5" ry="3" fill="#d9a52a" />
            <ellipse cx={s.x + 2} cy={top + 1} rx="1.5" ry="3" fill="#d9a52a" />
          </g>
        );
      })}
    </svg>
  );
}

function SheepArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 100 130"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="sheep-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfe7a8" />
          <stop offset="100%" stopColor="#5e9540" />
        </linearGradient>
        <radialGradient id="sheep-wool" cx="0.5" cy="0.4" r="0.5">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d4cfc0" />
        </radialGradient>
      </defs>
      <rect width="100" height="130" fill="url(#sheep-sky)" />
      {/* Hills */}
      <path d="M 0,90 Q 30,72 60,88 Q 80,98 100,86 L 100,130 L 0,130 Z" fill="#4a7d34" />
      {/* Cloud */}
      <ellipse cx="22" cy="22" rx="14" ry="6" fill="#ffffff" opacity="0.85" />
      <ellipse cx="32" cy="20" rx="8" ry="5" fill="#ffffff" opacity="0.85" />
      {/* Sheep body — fluffy series of overlapping circles */}
      <g transform="translate(50, 80)">
        <circle cx="-12" cy="2" r="9" fill="url(#sheep-wool)" />
        <circle cx="-4" cy="-2" r="11" fill="url(#sheep-wool)" />
        <circle cx="6" cy="0" r="10" fill="url(#sheep-wool)" />
        <circle cx="14" cy="3" r="8" fill="url(#sheep-wool)" />
        {/* Head */}
        <ellipse cx="20" cy="0" rx="6" ry="7" fill="#3a2a20" />
        <circle cx="18" cy="-2" r="1.2" fill="#fff" />
        <circle cx="22" cy="-2" r="1.2" fill="#fff" />
        {/* Legs */}
        <rect x="-10" y="10" width="2.5" height="6" fill="#3a2a20" />
        <rect x="-2" y="10" width="2.5" height="6" fill="#3a2a20" />
        <rect x="6" y="10" width="2.5" height="6" fill="#3a2a20" />
        <rect x="14" y="10" width="2.5" height="6" fill="#3a2a20" />
      </g>
    </svg>
  );
}

function OreArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 100 130"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="ore-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9bb0c4" />
          <stop offset="100%" stopColor="#4d5d70" />
        </linearGradient>
        <linearGradient id="ore-mountain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a8696" />
          <stop offset="100%" stopColor="#2e3a4a" />
        </linearGradient>
        <linearGradient id="ore-mountain-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a4afbf" />
          <stop offset="100%" stopColor="#48556a" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#ore-sky)" />
      {/* Back mountains */}
      <polygon points="0,90 20,40 38,80 60,30 82,80 100,50 100,130 0,130" fill="url(#ore-mountain)" />
      {/* Front lighter mountain */}
      <polygon points="10,110 35,55 58,100 78,70 100,110 100,130 0,130" fill="url(#ore-mountain-light)" opacity="0.7" />
      {/* Snow caps */}
      <polygon points="20,40 16,52 24,52" fill="#ffffff" opacity="0.85" />
      <polygon points="60,30 54,46 66,46" fill="#ffffff" opacity="0.85" />
      <polygon points="35,55 30,66 40,66" fill="#ffffff" opacity="0.7" />
      {/* Foreground rocks */}
      <polygon points="20,118 30,108 38,118" fill="#3a4658" stroke="#1c2330" strokeWidth="0.5" />
      <polygon points="60,120 72,106 84,118" fill="#46546a" stroke="#1c2330" strokeWidth="0.5" />
    </svg>
  );
}

const ART: Record<Resource, (props: ArtProps) => React.ReactElement> = {
  wood: WoodArt,
  brick: BrickArt,
  wheat: WheatArt,
  sheep: SheepArt,
  ore: OreArt,
};

const RESOURCE_NAMES_TR: Record<Resource, string> = {
  wood: "Tahta",
  brick: "Tuğla",
  wheat: "Buğday",
  sheep: "Koyun",
  ore: "Cevher",
};

const RESOURCE_FRAME_COLORS: Record<Resource, string> = {
  wood: "#1f4d1c",
  brick: "#7e3216",
  wheat: "#b58e1c",
  sheep: "#5e9540",
  ore: "#3d4a5a",
};

// A single resource card — full art with header strip + footer label.
// Designed to work at sizes from ~40×60 (mini) to 100×140 (modal display).
export function ResourceCard({
  kind,
  count,
  highlighted = false,
  width = 56,
  height = 84,
  className = "",
  showCount = true,
}: {
  kind: Resource;
  count?: number;
  highlighted?: boolean;
  width?: number;
  height?: number;
  className?: string;
  showCount?: boolean;
}) {
  const Art = ART[kind];
  const frame = RESOURCE_FRAME_COLORS[kind];
  return (
    <div
      className={`relative overflow-hidden rounded-md shadow-[0_4px_10px_rgba(0,0,0,0.45)] ${className}`}
      style={{
        width,
        height,
        boxShadow: highlighted
          ? "0 0 0 2px #fcd34d, 0 0 14px rgba(252, 211, 77, 0.7)"
          : `0 0 0 1.5px ${frame}, 0 4px 10px rgba(0,0,0,0.45)`,
      }}
    >
      {/* Art fills the card */}
      <Art className="absolute inset-0 h-full w-full" />
      {/* Top-left thin label band */}
      <div
        className="absolute left-0 right-0 top-0 px-1.5 text-[8px] font-bold uppercase tracking-wider text-white"
        style={{
          background: `linear-gradient(180deg, ${frame}f0 0%, ${frame}80 100%)`,
        }}
      >
        {RESOURCE_NAMES_TR[kind]}
      </div>
      {/* Count badge top-right */}
      {showCount && count !== undefined && count > 0 && (
        <div className="absolute right-1 top-3 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-slate-900 shadow">
          ×{count}
        </div>
      )}
    </div>
  );
}

export { RESOURCE_NAMES_TR, RESOURCE_FRAME_COLORS };

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------

const DEV_CARD_NAMES_TR: Record<DevelopmentCard, string> = {
  knight: "Şövalye",
  road_building: "Yol Yapımı",
  year_of_plenty: "Bereket Yılı",
  monopoly: "Tekel",
  victory_point: "Galibiyet",
};

const DEV_CARD_DESC_TR: Record<DevelopmentCard, string> = {
  knight: "Hırsızı taşı, kart çal",
  road_building: "2 yol bedava",
  year_of_plenty: "2 kaynak al",
  monopoly: "Bir kaynağı sor",
  victory_point: "+1 galibiyet puanı",
};

// Full hover-tooltip text for each dev card. The short DEV_CARD_DESC_TR
// is what we print on the card face; this longer version shows on hover
// so the player gets the full rules without consulting a manual.
const DEV_CARD_LONG_DESC_TR: Record<DevelopmentCard, string> = {
  knight:
    "Hırsızı istediğin bir hex'e taşır ve o hex'in komşusu olan bir oyuncudan rastgele bir kaynak çalarsın. 3 şövalye oynayan oyuncu En Büyük Ordu (+2 PD) bonusunu alır.",
  road_building:
    "Bu turda 2 yolu (veya gemiyi) ücretsiz inşa edersin. İnşa kuralları normal: kendi yapın veya yol/gemine bağlı olmalı.",
  year_of_plenty:
    "Bankadan istediğin 2 kaynağı al — istersen aynı türden 2, istersen iki farklı kaynak. Banka boşsa o tür alınamaz.",
  monopoly:
    "Bir kaynak türü seç. Tüm rakipler ellerindeki o kaynak kartlarını sana verir.",
  victory_point:
    "Saklı +1 galibiyet puanı. Sadece kazandığın anda açılır; rakiplerin görmez.",
};

export { DEV_CARD_LONG_DESC_TR };

const DEV_CARD_FRAME: Record<DevelopmentCard, string> = {
  knight: "#a02a2a",
  road_building: "#2a6b3a",
  year_of_plenty: "#b58e1c",
  monopoly: "#6a2a8a",
  victory_point: "#c89b1c",
};

function KnightArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="knight-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e87878" />
          <stop offset="100%" stopColor="#7a1818" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#knight-bg)" />
      {/* Crossed swords */}
      <g transform="translate(50, 70)">
        <g transform="rotate(-30)">
          <rect x="-2" y="-32" width="4" height="48" fill="#d4d4d4" />
          <rect x="-6" y="14" width="12" height="3" fill="#3a2a20" />
          <rect x="-1.5" y="14" width="3" height="10" fill="#3a2a20" />
          <circle cx="0" cy="26" r="3" fill="#3a2a20" />
        </g>
        <g transform="rotate(30)">
          <rect x="-2" y="-32" width="4" height="48" fill="#d4d4d4" />
          <rect x="-6" y="14" width="12" height="3" fill="#3a2a20" />
          <rect x="-1.5" y="14" width="3" height="10" fill="#3a2a20" />
          <circle cx="0" cy="26" r="3" fill="#3a2a20" />
        </g>
      </g>
      {/* Shield in front */}
      <path d="M 50,40 L 36,46 L 36,68 Q 36,82 50,90 Q 64,82 64,68 L 64,46 Z" fill="#c4c8d4" stroke="#2a2a2a" strokeWidth="1.2" />
      <path d="M 50,40 L 36,46 L 36,68 Q 36,82 50,90 Q 64,82 64,68 L 64,46 Z" fill="none" stroke="#7a1818" strokeWidth="1" opacity="0.4" />
      <text x="50" y="72" textAnchor="middle" fontSize="14" fontWeight="900" fill="#7a1818">⚔</text>
    </svg>
  );
}

function RoadBuildingArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="rb-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fc060" />
          <stop offset="100%" stopColor="#1d4014" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#rb-bg)" />
      {/* Two parallel roads going to horizon */}
      <polygon points="20,110 36,110 56,40 50,40" fill="#5a3a1a" stroke="#2a1a08" strokeWidth="0.8" />
      <polygon points="64,110 80,110 56,40 50,40" fill="#7a4f2a" stroke="#2a1a08" strokeWidth="0.8" />
      {/* Road markings */}
      <line x1="28" y1="100" x2="42" y2="60" stroke="#fff8c4" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="72" y1="100" x2="58" y2="60" stroke="#fff8c4" strokeWidth="1" strokeDasharray="3 3" />
      {/* Hill */}
      <ellipse cx="50" cy="44" rx="24" ry="6" fill="#1d4014" />
    </svg>
  );
}

function YearOfPlentyArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="yop-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7d870" />
          <stop offset="100%" stopColor="#a87015" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#yop-bg)" />
      {/* Cornucopia / overflowing basket */}
      <g transform="translate(50, 70)">
        {/* Basket */}
        <ellipse cx="0" cy="20" rx="28" ry="8" fill="#7a4f2a" />
        <path d="M -28,20 Q -28,-8 0,-12 Q 28,-8 28,20 Z" fill="#a06a36" stroke="#4a2a10" strokeWidth="1" />
        {/* Wheat sticking out */}
        <ellipse cx="-12" cy="-14" rx="3" ry="8" fill="#f0c14f" transform="rotate(-15, -12, -14)" />
        <ellipse cx="0" cy="-18" rx="3" ry="9" fill="#f0c14f" />
        <ellipse cx="12" cy="-14" rx="3" ry="8" fill="#f0c14f" transform="rotate(15, 12, -14)" />
        {/* Apples */}
        <circle cx="-8" cy="-4" r="4" fill="#c2402c" />
        <circle cx="6" cy="-2" r="4" fill="#c2402c" />
        <circle cx="0" cy="0" r="3.5" fill="#7fb842" />
      </g>
    </svg>
  );
}

function MonopolyArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="mono-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b87fd4" />
          <stop offset="100%" stopColor="#3d1058" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#mono-bg)" />
      {/* Crown */}
      <g transform="translate(50, 70)">
        <path d="M -22,8 L -22,-12 L -10,2 L 0,-18 L 10,2 L 22,-12 L 22,8 Z" fill="#fcd34d" stroke="#7a4f06" strokeWidth="1.5" />
        <rect x="-22" y="8" width="44" height="6" fill="#e8b34a" stroke="#7a4f06" strokeWidth="1" />
        {/* Jewels */}
        <circle cx="-10" cy="2" r="2.5" fill="#c2402c" />
        <circle cx="0" cy="-12" r="3" fill="#3a8aff" />
        <circle cx="10" cy="2" r="2.5" fill="#3aa84e" />
      </g>
      {/* Coin pile below */}
      <ellipse cx="35" cy="105" rx="10" ry="3" fill="#fcd34d" />
      <ellipse cx="50" cy="108" rx="12" ry="3.5" fill="#fcd34d" />
      <ellipse cx="65" cy="105" rx="10" ry="3" fill="#fcd34d" />
    </svg>
  );
}

function VictoryPointArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="vp-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#7a4f06" />
        </linearGradient>
      </defs>
      <rect width="100" height="130" fill="url(#vp-bg)" />
      {/* Star */}
      <g transform="translate(50, 70)">
        <polygon
          points="0,-30 8,-9 30,-9 12,5 18,26 0,14 -18,26 -12,5 -30,-9 -8,-9"
          fill="#fff8c4"
          stroke="#7a4f06"
          strokeWidth="1.5"
        />
        <polygon
          points="0,-22 6,-7 22,-7 9,3 14,18 0,10 -14,18 -9,3 -22,-7 -6,-7"
          fill="#fcd34d"
        />
      </g>
    </svg>
  );
}

const DEV_ART: Record<DevelopmentCard, (p: ArtProps) => React.ReactElement> = {
  knight: KnightArt,
  road_building: RoadBuildingArt,
  year_of_plenty: YearOfPlentyArt,
  monopoly: MonopolyArt,
  victory_point: VictoryPointArt,
};

export function DevCard({
  kind,
  count,
  highlighted = false,
  pending = false,
  width = 56,
  height = 84,
  showCount = true,
  showDesc = false,
}: {
  kind: DevelopmentCard;
  count?: number;
  highlighted?: boolean;
  pending?: boolean;
  width?: number;
  height?: number;
  showCount?: boolean;
  showDesc?: boolean;
}) {
  const Art = DEV_ART[kind];
  const frame = DEV_CARD_FRAME[kind];
  return (
    <div
      className={`relative overflow-hidden rounded-md ${pending ? "opacity-50 grayscale" : ""}`}
      style={{
        width,
        height,
        boxShadow: highlighted
          ? "0 0 0 2px #fcd34d, 0 0 14px rgba(252, 211, 77, 0.7)"
          : `0 0 0 1.5px ${frame}, 0 4px 10px rgba(0,0,0,0.45)`,
      }}
    >
      <Art className="absolute inset-0 h-full w-full" />
      <div
        className="absolute left-0 right-0 top-0 truncate px-1.5 text-[8px] font-bold uppercase tracking-wider text-white"
        style={{ background: `linear-gradient(180deg, ${frame}f0 0%, ${frame}80 100%)` }}
      >
        {DEV_CARD_NAMES_TR[kind]}
      </div>
      {showCount && count !== undefined && count > 0 && (
        <div className="absolute right-1 top-3 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-slate-900 shadow">
          ×{count}
        </div>
      )}
      {pending && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wider text-amber-200">
          Sıra sonu
        </div>
      )}
      {showDesc && (
        <div className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-1 py-0.5 text-center text-[7px] font-medium text-white/90">
          {DEV_CARD_DESC_TR[kind]}
        </div>
      )}
    </div>
  );
}

export { DEV_CARD_NAMES_TR, DEV_CARD_DESC_TR };
