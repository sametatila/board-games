"use client";

/**
 * Sunny Harbor's bound flavour of the platform `useParty` hook. Wires
 * the generic socket layer to this game's store + Turkish-localised
 * error messages.
 */

import { useGameStore } from "@/platform/store";
import { useParty as useGenericParty } from "@/platform/useParty";

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    not_enough_resources: "Yeterli kaynağın yok.",
    not_enough_to_give: "Vermek istediğin kaynaklar elinde yok.",
    not_enough_to_receive: "Karşı tarafta gereken kaynak yok.",
    bank_empty: "Banka tükendi.",
    deck_empty: "Gelişme kartı kalmadı.",
    no_settlements_left: "Yerleştirilebilir yerleşim kalmadı.",
    no_cities_left: "Yerleştirilebilir şehir kalmadı.",
    no_roads_left: "Yerleştirilebilir yol kalmadı.",
    already_played_dev: "Bu turda zaten bir gelişme kartı oynadın.",
    no_knight_card: "Şövalye kartın yok.",
    no_card: "Bu kart elinde yok.",
    wrong_phase: "Şu an bunu yapamazsın (yanlış aşama).",
    wrong_subphase:
      "Şu an bunu yapamazsın (sıra başkasında veya başka eylem bekleniyor).",
  };
  return labels[reason] ?? reason;
}

function friendlyError(code: string, raw: string): string | null {
  switch (code) {
    case "spectator":
      return "Oyun başlamış — izleyici olarak bağlandın.";
    case "full":
      return "Oda dolu (8 oyuncu).";
    case "not_host":
      return "Bu işlem sadece host tarafından yapılabilir.";
    case "not_enough_players":
      return "Oyunu başlatmak için en az 2 oyuncu gerekli.";
    case "start_failed":
      return `Oyun başlatılamadı: ${raw}`;
    case "not_allowed":
      return raw;
    case "bad_json":
      return "Geçersiz mesaj.";
    case "action_rejected": {
      const visible = new Set([
        "not_enough_resources",
        "not_enough_to_give",
        "not_enough_to_receive",
        "bank_empty",
        "deck_empty",
        "no_settlements_left",
        "no_cities_left",
        "no_roads_left",
        "already_played_dev",
        "no_knight_card",
        "no_card",
        "wrong_phase",
        "wrong_subphase",
      ]);
      if (visible.has(raw)) return reasonLabel(raw);
      return null;
    }
    default:
      return raw;
  }
}

export function useParty(roomCode: string | null, nickname: string) {
  return useGenericParty(useGameStore, roomCode, nickname, "sunny_harbor", friendlyError);
}
