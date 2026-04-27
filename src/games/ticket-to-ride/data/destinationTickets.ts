import type { Ticket } from "../types";

/**
 * 30 destination ticket — Ticket to Ride USA klasik. Şehirler iki yönlü
 * (zincir tek yönlü değil). Resmi kart değerleri.
 */

const t = (id: string, fromCity: string, toCity: string, value: number): Ticket => ({
  id,
  fromCity,
  toCity,
  value,
});

export const DESTINATION_TICKETS: Ticket[] = [
  t("dt-1", "los_angeles", "new_york", 21),
  t("dt-2", "duluth", "houston", 8),
  t("dt-3", "sault_st_marie", "nashville", 8),
  t("dt-4", "new_york", "atlanta", 6),
  t("dt-5", "portland", "nashville", 17),
  t("dt-6", "vancouver", "montreal", 20),
  t("dt-7", "duluth", "el_paso", 10),
  t("dt-8", "toronto", "miami", 10),
  t("dt-9", "portland", "phoenix", 11),
  t("dt-10", "dallas", "new_york", 11),
  t("dt-11", "calgary", "salt_lake_city", 7),
  t("dt-12", "calgary", "phoenix", 13),
  t("dt-13", "los_angeles", "miami", 20),
  t("dt-14", "winnipeg", "little_rock", 11),
  t("dt-15", "san_francisco", "atlanta", 17),
  t("dt-16", "kansas_city", "houston", 5),
  t("dt-17", "los_angeles", "chicago", 16),
  t("dt-18", "denver", "pittsburgh", 11),
  t("dt-19", "chicago", "santa_fe", 9),
  t("dt-20", "vancouver", "santa_fe", 13),
  t("dt-21", "boston", "miami", 12),
  t("dt-22", "chicago", "new_orleans", 7),
  t("dt-23", "montreal", "atlanta", 9),
  t("dt-24", "seattle", "new_york", 22),
  t("dt-25", "denver", "el_paso", 4),
  t("dt-26", "helena", "los_angeles", 8),
  t("dt-27", "winnipeg", "houston", 12),
  t("dt-28", "montreal", "new_orleans", 13),
  t("dt-29", "sault_st_marie", "oklahoma_city", 9),
  t("dt-30", "seattle", "los_angeles", 9),
];
