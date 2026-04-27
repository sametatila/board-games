"use client";

import { useParty as useGenericParty } from "@/platform/useParty";
import { useSplendorStore } from "./store";

const reasonLabels: Record<string, string> = {
  not_enough_players: "Oyunu başlatmak için en az 2 oyuncu gerekli.",
  too_many_players: "Splendor en fazla 4 oyuncu ile oynanır.",
  not_host: "Bu işlem sadece host tarafından yapılabilir.",
  full: "Oda dolu (4 oyuncu).",
  spectator: "Oyun başlamış — izleyici olarak bağlandın.",
  color_taken: "Bu renk başka bir oyuncuda.",
  must_be_distinct: "Farklı renkler seçmelisin (aynısından 2 için ayrı buton var).",
  invalid_count: "1, 2 veya 3 farklı renk seçmen gerek.",
  token_unavailable: "Seçtiğin renklerden bankada yok.",
  need_4_in_bank: "Aynı renkten 2 almak için bankada en az 4 olmalı.",
  reserve_full: "Rezerv limiti 3 — daha fazla rezerv yapamazsın.",
  empty_slot: "Bu kart slotunda kart yok.",
  deck_empty: "Bu tier desteği boşaldı.",
  no_reserved_at_index: "Rezervde böyle bir kart yok.",
  "useGold mismatch for white": "Altın dağılımı hatalı.",
  "useGold mismatch for blue": "Altın dağılımı hatalı.",
  "useGold mismatch for green": "Altın dağılımı hatalı.",
  "useGold mismatch for red": "Altın dağılımı hatalı.",
  "useGold mismatch for black": "Altın dağılımı hatalı.",
  "not enough gold": "Yeterli altının yok.",
  must_discard_to_10: "10 jetona kadar inecek şekilde at.",
  not_eligible: "Bu soylu seni ziyaret edemez.",
  wrong_phase: "Şu anda bu yapılamaz.",
  wrong_subphase: "Şu anda bu yapılamaz (başka eylem bekleniyor).",
  not_your_turn: "Sıra sende değil.",
};

function friendlyError(code: string, raw: string): string | null {
  if (code === "spectator") return reasonLabels.spectator;
  if (code === "full") return reasonLabels.full;
  if (code === "start_rejected" || code === "action_rejected") {
    return reasonLabels[raw] ?? raw;
  }
  return raw;
}

export function useParty(roomCode: string | null, nickname: string) {
  return useGenericParty(
    useSplendorStore,
    roomCode,
    nickname,
    "splendor",
    friendlyError,
  );
}
