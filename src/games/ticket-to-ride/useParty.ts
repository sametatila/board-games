"use client";

import { useParty as useGenericParty } from "@/platform/useParty";
import { useTtrStore } from "./store";

const reasonLabels: Record<string, string> = {
  not_enough_players: "Oyunu başlatmak için en az 2 oyuncu gerekli.",
  too_many_players: "Ticket to Ride en fazla 5 oyuncu ile oynanır.",
  not_host: "Bu işlem sadece host tarafından yapılabilir.",
  full: "Oda dolu (5 oyuncu).",
  spectator: "Oyun başlamış — izleyici olarak bağlandın.",
  color_taken: "Bu renk başka bir oyuncuda.",
  must_keep_at_least_2: "İlk seçimde en az 2 görev kartı tutmalısın.",
  must_keep_at_least_1: "En az 1 görev kartı tutmalısın.",
  invalid_keep_set: "Görev seçiminde hatalı kart var.",
  no_pending_tickets: "Bekleyen görev kartı yok.",
  no_such_route: "Böyle bir yol yok.",
  already_claimed: "Bu yol zaten alınmış.",
  parallel_locked_at_low_count: "2-3 oyuncuda paralel yolların biri kapalı.",
  cannot_claim_both_parallels: "Aynı paralel yolun iki tarafını alamazsın.",
  not_enough_trains: "Yeterli vagonun yok.",
  card_count_mismatch: "Kart sayısı yol uzunluğuyla uyuşmuyor.",
  multiple_colours: "Aynı renkten + lokomotif kullan.",
  color_mismatch: "Yolun rengiyle eşleşmiyor.",
  not_enough_cards: "Bu kartlardan elinde yok.",
  negative_card_count: "Geçersiz kart sayısı.",
  deck_empty: "Tren kart desteği boşaldı.",
  empty_slot: "Bu market slotunda kart yok.",
  locomotive_second_draw: "İkinci çekişte açık lokomotif alamazsın.",
  ticket_deck_empty: "Görev destesi boşaldı.",
  wrong_phase: "Şu anda bu yapılamaz.",
  wrong_subphase: "Şu anda bu yapılamaz (başka eylem bekleniyor).",
  not_your_turn: "Sıra sende değil.",
};

function friendlyError(code: string, raw: string): string | null {
  if (code === "spectator") return reasonLabels.spectator;
  if (code === "full") return reasonLabels.full;
  if (
    code === "start_rejected" ||
    code === "action_rejected" ||
    code === "set_color_rejected" ||
    code === "set_settings_rejected"
  ) {
    return reasonLabels[raw] ?? raw;
  }
  return raw;
}

export function useParty(roomCode: string | null, nickname: string) {
  return useGenericParty(
    useTtrStore,
    roomCode,
    nickname,
    "ticket_to_ride",
    friendlyError,
  );
}
