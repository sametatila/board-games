import type { AxialCoord, HexTerrain, MapTemplateId } from "./types";

// Each map template returns a list of "slots" — coords paired with the type
// of hex that goes there. Some slots are forced (always sea, always fog,
// always desert, always gold), others are "land" placeholders that the
// generator fills with the random resource pool.
export type HexSlot = {
  coord: AxialCoord;
  /** Forced terrain. If undefined, the generator picks a resource. */
  forced?: HexTerrain;
  /** Used to distinguish disjoint islands so we can give bonuses for first
   *  settlement on a foreign island. Sea hexes get islandId = "sea". */
  islandId?: string;
  /** If true, this hex starts hidden under fog and is revealed via exploration. */
  hidden?: boolean;
};

export type MapTemplate = {
  id: MapTemplateId;
  /** Human-readable name (Turkish for the lobby). */
  name: string;
  description: string;
  /** Whether this map allows ship building & uses sea edges. */
  hasShips: boolean;
  /** Whether the pirate (sea robber) is in play. */
  hasPirate: boolean;
  /** If true, hexes flagged hidden start under fog and reveal as players approach. */
  hasFog: boolean;
  /** Bonus VP awarded for the first settlement on a "foreign" island
   *  (any island other than the one with the player's first settlement). */
  foreignIslandBonusVP: number;
  /** Bonus VP for the first settlement that crosses a desert tile (Through-Desert flavor). */
  desertCrossingBonusVP: number;
  /** VP override for this map (12 instead of 10 for some scenarios). */
  victoryPointsToWin?: number;
  /** Build the slot list given a player count, so we can pick a tight layout. */
  buildSlots(playerCount: number): HexSlot[];
};

// Helpers ------------------------------------------------------------------

function rect(rows: number[], rOffset = -Math.floor(rows.length / 2)): AxialCoord[] {
  // Build a stretched-hex set with the given row widths, rOffset = top row.
  const out: AxialCoord[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rOffset + i;
    const w = rows[i];
    const qStart = -Math.floor((w - 1) / 2) - Math.floor(r / 2);
    for (let j = 0; j < w; j++) out.push({ q: qStart + j, r });
  }
  return out;
}

function spiral(radius: number, center: AxialCoord = { q: 0, r: 0 }): AxialCoord[] {
  // Same spiral as src/games/sunny-harbor/hex.ts spiralOf, duplicated here to avoid an import cycle.
  const HEX_DIRECTIONS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  const out: AxialCoord[] = [{ ...center }];
  for (let R = 1; R <= radius; R++) {
    let cur: AxialCoord = {
      q: center.q + HEX_DIRECTIONS[4].q * R,
      r: center.r + HEX_DIRECTIONS[4].r * R,
    };
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < R; j++) {
        out.push(cur);
        cur = {
          q: cur.q + HEX_DIRECTIONS[i].q,
          r: cur.r + HEX_DIRECTIONS[i].r,
        };
      }
    }
  }
  return out;
}

function landSlot(c: AxialCoord, islandId = "main"): HexSlot {
  return { coord: c, islandId };
}
function seaSlot(c: AxialCoord): HexSlot {
  return { coord: c, forced: "sea", islandId: "sea" };
}
function fogSlot(c: AxialCoord, islandId = "main"): HexSlot {
  return { coord: c, hidden: true, islandId };
}
function goldSlot(c: AxialCoord, islandId = "sea"): HexSlot {
  return { coord: c, forced: "gold", islandId };
}

// Add a single ring of sea hexes around every existing slot. Ships need
// reachable water tiles next to the coast and we avoid filling the entire
// bounding box (which would balloon the hex count needlessly). Call multiple
// times for a thicker ocean.
function fillSeaAroundLand(slots: HexSlot[], rings = 1) {
  const HEX_DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  for (let ring = 0; ring < rings; ring++) {
    const taken = new Set(slots.map((s) => `${s.coord.q},${s.coord.r}`));
    const additions: AxialCoord[] = [];
    for (const s of slots) {
      for (const d of HEX_DIRS) {
        const c = { q: s.coord.q + d.q, r: s.coord.r + d.r };
        const key = `${c.q},${c.r}`;
        if (taken.has(key)) continue;
        taken.add(key);
        additions.push(c);
      }
    }
    for (const c of additions) slots.push(seaSlot(c));
  }
}

// Templates ----------------------------------------------------------------

const classic: MapTemplate = {
  id: "classic",
  name: "Klasik Catan",
  description: "Tek ada, klasik 19/30/44 hex layout.",
  hasShips: false,
  hasPirate: false,
  hasFog: false,
  foreignIslandBonusVP: 0,
  desertCrossingBonusVP: 0,
  buildSlots(playerCount) {
    const widths =
      playerCount <= 4
        ? [3, 4, 5, 4, 3]
        : playerCount <= 6
        ? [3, 4, 5, 6, 5, 4, 3]
        : [3, 4, 5, 6, 8, 6, 5, 4, 3];
    return rect(widths).map((c) => landSlot(c, "main"));
  },
};

const twinIslands: MapTemplate = {
  id: "twin_islands",
  name: "Yeni Kıyılar",
  description:
    "Ana kıta + 3 küçük dış ada, gemiyle keşfet. Her yeni adada bonus GP.",
  hasShips: true,
  hasPirate: true,
  hasFog: false,
  foreignIslandBonusVP: 2,
  desertCrossingBonusVP: 0,
  victoryPointsToWin: 13,
  buildSlots(playerCount) {
    const slots: HexSlot[] = [];
    // Main island: a 3-4-5-4-3 hexagon offset to the left.
    const mainShape = playerCount <= 4
      ? [3, 4, 5, 4, 3]
      : [3, 4, 5, 6, 5, 4, 3];
    const mainCenterOffset = -3;
    for (const c of rect(mainShape)) {
      slots.push(landSlot({ q: c.q + mainCenterOffset, r: c.r }, "main"));
    }
    // Three small islands on the east side. Each is 3 hexes in a triangle.
    const islandCenters: { id: string; c: AxialCoord }[] = [
      { id: "north", c: { q: 4, r: -3 } },
      { id: "east", c: { q: 5, r: 0 } },
      { id: "south", c: { q: 4, r: 3 } },
    ];
    for (const { id, c } of islandCenters) {
      slots.push(landSlot(c, id));
      slots.push(landSlot({ q: c.q + 1, r: c.r }, id));
      slots.push(landSlot({ q: c.q, r: c.r + 1 }, id));
    }
    // A couple of gold fields between islands as exploration reward.
    slots.push(goldSlot({ q: 3, r: -1 }));
    slots.push(goldSlot({ q: 3, r: 2 }));
    // Fill the bounding box gaps with sea so ships have water to sail on.
    fillSeaAroundLand(slots, 1);
    return slots;
  },
};

const fourIslands: MapTemplate = {
  id: "archipelago",
  name: "Dört Ada",
  description:
    "Dört eşit ada cross şeklinde dizili. Yabancı adaya yerleşim +1 GP.",
  hasShips: true,
  hasPirate: true,
  hasFog: false,
  foreignIslandBonusVP: 1,
  desertCrossingBonusVP: 0,
  victoryPointsToWin: 12,
  buildSlots() {
    const slots: HexSlot[] = [];
    // 4 islands at NE, SE, SW, NW. Each is a hexagon of 7 hexes (radius 1).
    const islands = [
      { id: "ne", center: { q: 3, r: -3 } },
      { id: "se", center: { q: 3, r: 1 } },
      { id: "sw", center: { q: -3, r: 3 } },
      { id: "nw", center: { q: -3, r: -1 } },
    ];
    for (const isl of islands) {
      for (const c of spiral(1, isl.center)) {
        slots.push(landSlot(c, isl.id));
      }
    }
    fillSeaAroundLand(slots, 1);
    return slots;
  },
};

const fogIslands: MapTemplate = {
  id: "fog_frontier",
  name: "Sis Adaları",
  description:
    "İki ada arasında sisle örtülü hex'ler — gemi yaklaşınca açılır.",
  hasShips: true,
  hasPirate: true,
  hasFog: true,
  foreignIslandBonusVP: 1,
  desertCrossingBonusVP: 0,
  buildSlots() {
    const slots: HexSlot[] = [];
    // North island
    for (const c of rect([3, 4, 3], -4)) slots.push(landSlot(c, "north"));
    // South island
    for (const c of rect([3, 4, 3], 2)) slots.push(landSlot(c, "south"));
    // Fog band between them (two rows). Players reveal these as they explore.
    for (const c of rect([5, 6, 5], -1)) {
      slots.push(fogSlot(c, "fog"));
    }
    fillSeaAroundLand(slots, 1);
    return slots;
  },
};

const throughDesert: MapTemplate = {
  id: "desert_spiral",
  name: "Çöl Üzerinden",
  description:
    "Ana adanın ortasından geçen çöl bandı. Çölün karşı tarafına ilk yerleşim +2 GP.",
  hasShips: false,
  hasPirate: false,
  hasFog: false,
  foreignIslandBonusVP: 0,
  desertCrossingBonusVP: 2,
  victoryPointsToWin: 12,
  buildSlots(playerCount) {
    const widths =
      playerCount <= 4
        ? [3, 4, 5, 4, 3]
        : [3, 4, 5, 6, 5, 4, 3];
    const baseCoords = rect(widths);
    const slots: HexSlot[] = [];
    // Mark hexes on r=0 as desert. Use islandId "north"/"south" depending on
    // their row so we can detect crossing.
    for (const c of baseCoords) {
      if (c.r === 0) {
        slots.push({ coord: c, forced: "desert", islandId: "main" });
      } else {
        slots.push(landSlot(c, c.r < 0 ? "north" : "south"));
      }
    }
    return slots;
  },
};

const pirateIslands: MapTemplate = {
  id: "continental_divide",
  name: "Korsan Adaları",
  description:
    "Doğuda yerleşim adası + batıda korsan kalesi. Gemi savaş gemisine yükseltilebilir.",
  hasShips: true,
  hasPirate: true,
  hasFog: false,
  foreignIslandBonusVP: 0,
  desertCrossingBonusVP: 0,
  victoryPointsToWin: 11,
  buildSlots() {
    const slots: HexSlot[] = [];
    // Main settled island on the east (3-4-5-4-3 shifted right)
    for (const c of rect([3, 4, 5, 4, 3])) {
      slots.push(landSlot({ q: c.q + 2, r: c.r }, "main"));
    }
    // Pirate fortress isles on the west — two desert hexes (no production)
    slots.push({ coord: { q: -5, r: -1 }, forced: "desert", islandId: "fortress_north" });
    slots.push({ coord: { q: -5, r: 0 }, forced: "desert", islandId: "fortress_south" });
    // A gold field as adventurer's prize at the cross-over
    slots.push(goldSlot({ q: -2, r: 0 }));
    fillSeaAroundLand(slots, 1);
    return slots;
  },
};

// Long-form "how to play" guide for each map. Surface this in the lobby
// and via a help button so players know what's special about the variant
// they're sitting down to play. Plain prose; rendered as paragraphs.
export const MAP_GUIDES: Record<MapTemplateId, { title: string; sections: { heading: string; body: string }[] }> = {
  classic: {
    title: "Klasik Catan",
    sections: [
      {
        heading: "Hedef",
        body:
          "Yerleşim, şehir, en uzun yol ve gizli galibiyet kartlarıyla yukarıda gösterilen galibiyet puanına ilk ulaşan oyuncu kazanır. Klasik kural 10 GP'dir; oyuncu sayısına ve host ayarına göre değişir. 7+ oyuncuda settlement/road limitleri de otomatik yükselir.",
      },
      {
        heading: "Sıra akışı",
        body:
          "Sırası gelen oyuncu önce zar atar (7 hariç), uygun hex'lerin komşu yapılarına kaynak dağılır, sonra ticaret yapabilir, kaynaklarıyla yapı/yol/kart inşa edebilir, en az bir kart oynayabilir ve sırayı bitirir.",
      },
      {
        heading: "Hırsız",
        body:
          "7 atılınca 7'den fazla kart tutan herkes elini yarıya indirir. Aktif oyuncu hırsızı istediği hex'e taşır ve o hex'in komşu yapılarından birinden rastgele bir kaynak çalar. Hırsızın bulunduğu hex artık üretmez.",
      },
      {
        heading: "Bonuslar",
        body:
          "5+ ardışık yol En Uzun Yol bonusu (+2 GP), 3+ Şövalye oynanmış En Büyük Ordu bonusu (+2 GP) verir. Limanlar 2:1 (kaynaklı) veya 3:1 (genel) takas hakkı sağlar.",
      },
    ],
  },
  twin_islands: {
    title: "Yeni Kıyılar",
    sections: [
      {
        heading: "Genel",
        body:
          "Ana kıta + 3 küçük dış ada. Gemilerle dış adalara açıl, oradaki yerleşimler bonus puan getirir. Galibiyet hedefi yukarıda gösterilen puandır (varsayılan 13).",
      },
      {
        heading: "Gemiler",
        body:
          "Gemi (1🌲 1🐑) bir kenara kurulur ve yol gibi davranır ama deniz/kıyı kenarlarında oturur. Bir gemiyi sırada bir kez taşıyabilirsin (zincir ucunda olanlar) — yeni inşa ettiğin gemi taşınamaz.",
      },
      {
        heading: "Yabancı ada bonusu",
        body:
          "İlk yerleşimini farklı bir adada açtığın anda +2 GP kazanırsın. Üç dış adanın hepsine de yerleştiğinde toplamda +6 GP elde edebilirsin.",
      },
      {
        heading: "Korsan",
        body:
          "Bu haritada hırsızla birlikte korsan da var. 7 atılınca veya Şövalye oynayınca, hedef bir kara hex ise hırsız taşınır; bir deniz hex ise korsan taşınır. Korsanın bulunduğu hex'in komşu gemilerinden kaynak çalar.",
      },
      {
        heading: "Altın hex",
        body:
          "Adalar arasında altın damarı hex'leri var. Üzerlerinde 2 hex altın olduğunda, bu hex'in komşusu olan oyuncu istediği bir kaynağı seçer.",
      },
    ],
  },
  archipelago: {
    title: "Dört Ada",
    sections: [
      {
        heading: "Genel",
        body:
          "Eşit boyutta 4 ada. Galibiyet hedefi yukarıda gösterilen puandır (varsayılan 12). Adaların hepsine yayılmak strateji açısından kritik.",
      },
      {
        heading: "Yabancı ada bonusu",
        body:
          "Her yeni adaya ilk kez yerleştiğinde +1 GP. Dört adanın tamamı +3 GP toplamında bonus verir.",
      },
      {
        heading: "Gemiler",
        body:
          "Bu haritada yol yerine gemi inşa edilir; gemiler kıyıdan kıyıya geçişi sağlar. Gemi zincirleri En Uzun Rota bonusunu da hedefler.",
      },
      {
        heading: "Korsan",
        body:
          "Korsan denize taşınır ve yakındaki gemilerden kaynak çalar. Şövalye oynanırken hex tipine göre hırsız ya da korsan hareket eder.",
      },
    ],
  },
  fog_frontier: {
    title: "Sis Adaları",
    sections: [
      {
        heading: "Genel",
        body:
          "Kuzey ve güney adaları arasında sisle örtülü hex'ler var. Sisli hex'ler üzerine bir gemi/yol komşu olduğunda otomatik açılır ve içeriği görünür hale gelir.",
      },
      {
        heading: "Sis nasıl açılır?",
        body:
          "Bir sis hex'inin kenarına gemi/yol kurman yeterli — sis kalkar, hex'in gerçek terreni (kara, altın, deniz) ortaya çıkar. Açılan kara üzerine yerleşim/yol kurabilir, denizden gemiyle geçebilirsin.",
      },
      {
        heading: "Yabancı ada bonusu",
        body:
          "İlk başladığın adadan başka bir adaya yerleştiğinde +1 GP.",
      },
    ],
  },
  desert_spiral: {
    title: "Çöl Üzerinden",
    sections: [
      {
        heading: "Genel",
        body:
          "Ana adanın ortasından bir çöl bandı geçer. Galibiyet hedefi yukarıda gösterilen puandır (varsayılan 12). Çölün karşı tarafına yerleşmek için yol köprüsü kurman gerekir.",
      },
      {
        heading: "Çöl geçiş bonusu",
        body:
          "Çölü kuzeye/güneye geçen ilk yerleşim +2 GP kazanır. Karşı tarafta üretici hex'leri olduğu için ekonomik olarak da karlı.",
      },
      {
        heading: "Gemiler yok",
        body:
          "Bu haritada deniz/gemi yok — sadece yol ve klasik kara mekaniği.",
      },
    ],
  },
  continental_divide: {
    title: "Korsan Adaları",
    sections: [
      {
        heading: "Genel",
        body:
          "Doğuda yerleşim adası, batıda korsanların kontrolündeki iki kale adası. Galibiyet hedefi yukarıda gösterilen puandır (varsayılan 11). Kale fethi büyük puan kazandırır.",
      },
      {
        heading: "Savaş gemisi",
        body:
          "Normal bir gemini, 1 Şövalye kartı harcayarak savaş gemisine yükseltebilirsin. Savaş gemisi korsana saldırabilir ve kalelere atak yapabilir.",
      },
      {
        heading: "Kale fethi",
        body:
          "Kalelerin 3 canı vardır. Kaleye komşu savaş geminle saldırırsın: aldığın 6 ile rakibin 6'sı arasında zar atılır, kazanırsan kaleden 1 can düşer. Cana 0 inince kale senin olur ve +2 GP kazanırsın.",
      },
      {
        heading: "Altın hex",
        body:
          "İki ada arasında bir altın damarı var; üzerinde sayı atıldığında komşu oyuncu istediği kaynağı seçer.",
      },
    ],
  },
};

export const MAP_TEMPLATES: Record<MapTemplateId, MapTemplate> = {
  classic,
  twin_islands: twinIslands,
  archipelago: fourIslands,
  fog_frontier: fogIslands,
  desert_spiral: throughDesert,
  continental_divide: pirateIslands,
};

export function getMapTemplate(id: MapTemplateId): MapTemplate {
  return MAP_TEMPLATES[id] ?? classic;
}
