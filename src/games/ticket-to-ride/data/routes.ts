import type { Route } from "../types";

/**
 * Ticket to Ride USA — full route list. ~78 segments, paralel yollar
 * `parallelGroupId` ile gruplanır. Renkler ve uzunluklar Days of
 * Wonder USA haritasına göre.
 */

const r = (
  id: string,
  fromCity: string,
  toCity: string,
  length: number,
  color: Route["color"],
  parallelGroupId?: string,
): Route => ({ id, fromCity, toCity, length, color, parallelGroupId });

export const ROUTES: Route[] = [
  // West coast
  r("vancouver-seattle-1", "vancouver", "seattle", 1, "gray", "vancouver-seattle"),
  r("vancouver-seattle-2", "vancouver", "seattle", 1, "gray", "vancouver-seattle"),
  r("vancouver-calgary", "vancouver", "calgary", 3, "gray"),
  r("seattle-calgary", "seattle", "calgary", 4, "gray"),
  r("seattle-portland-1", "seattle", "portland", 1, "gray", "seattle-portland"),
  r("seattle-portland-2", "seattle", "portland", 1, "gray", "seattle-portland"),
  r("seattle-helena", "seattle", "helena", 6, "yellow"),
  r("portland-san_francisco-1", "portland", "san_francisco", 5, "green", "portland-san_francisco"),
  r("portland-san_francisco-2", "portland", "san_francisco", 5, "purple", "portland-san_francisco"),
  r("portland-salt_lake_city", "portland", "salt_lake_city", 6, "blue"),

  // Calgary / Helena / Winnipeg
  r("calgary-winnipeg", "calgary", "winnipeg", 6, "white"),
  r("calgary-helena", "calgary", "helena", 4, "gray"),
  r("helena-winnipeg", "helena", "winnipeg", 4, "blue"),
  r("winnipeg-sault_st_marie", "winnipeg", "sault_st_marie", 6, "gray"),
  r("winnipeg-duluth", "winnipeg", "duluth", 4, "black"),

  // San Francisco / Salt Lake City / Denver
  r("san_francisco-salt_lake_city-1", "san_francisco", "salt_lake_city", 5, "orange", "san_francisco-salt_lake_city"),
  r("san_francisco-salt_lake_city-2", "san_francisco", "salt_lake_city", 5, "white", "san_francisco-salt_lake_city"),
  r("san_francisco-los_angeles-1", "san_francisco", "los_angeles", 3, "yellow", "san_francisco-los_angeles"),
  r("san_francisco-los_angeles-2", "san_francisco", "los_angeles", 3, "purple", "san_francisco-los_angeles"),
  r("salt_lake_city-las_vegas", "salt_lake_city", "las_vegas", 3, "orange"),
  r("salt_lake_city-denver-1", "salt_lake_city", "denver", 3, "red", "salt_lake_city-denver"),
  r("salt_lake_city-denver-2", "salt_lake_city", "denver", 3, "yellow", "salt_lake_city-denver"),
  r("salt_lake_city-helena", "salt_lake_city", "helena", 3, "purple"),
  r("helena-denver", "helena", "denver", 4, "green"),
  r("helena-duluth", "helena", "duluth", 6, "orange"),
  r("helena-omaha", "helena", "omaha", 5, "red"),

  // Denver hub
  r("denver-phoenix", "denver", "phoenix", 5, "white"),
  r("denver-santa_fe", "denver", "santa_fe", 2, "gray"),
  r("denver-oklahoma_city", "denver", "oklahoma_city", 4, "red"),
  r("denver-kansas_city-1", "denver", "kansas_city", 4, "black", "denver-kansas_city"),
  r("denver-kansas_city-2", "denver", "kansas_city", 4, "orange", "denver-kansas_city"),
  r("denver-omaha", "denver", "omaha", 4, "purple"),

  // Los Angeles / Las Vegas / Phoenix / El Paso
  r("los_angeles-las_vegas", "los_angeles", "las_vegas", 2, "gray"),
  r("los_angeles-phoenix", "los_angeles", "phoenix", 3, "gray"),
  r("los_angeles-el_paso", "los_angeles", "el_paso", 6, "black"),
  r("phoenix-santa_fe", "phoenix", "santa_fe", 3, "gray"),
  r("phoenix-el_paso", "phoenix", "el_paso", 3, "gray"),
  r("santa_fe-el_paso", "santa_fe", "el_paso", 2, "gray"),
  r("santa_fe-oklahoma_city", "santa_fe", "oklahoma_city", 3, "blue"),
  r("el_paso-oklahoma_city", "el_paso", "oklahoma_city", 5, "yellow"),
  r("el_paso-dallas-1", "el_paso", "dallas", 4, "red", "el_paso-dallas"),
  r("el_paso-dallas-2", "el_paso", "dallas", 4, "red", "el_paso-dallas"),
  r("el_paso-houston", "el_paso", "houston", 6, "green"),

  // Plains
  r("duluth-sault_st_marie", "duluth", "sault_st_marie", 3, "gray"),
  r("duluth-toronto", "duluth", "toronto", 6, "purple"),
  r("duluth-chicago", "duluth", "chicago", 3, "red"),
  r("duluth-omaha-1", "duluth", "omaha", 2, "gray", "duluth-omaha"),
  r("duluth-omaha-2", "duluth", "omaha", 2, "gray", "duluth-omaha"),
  r("omaha-chicago", "omaha", "chicago", 4, "blue"),
  r("omaha-kansas_city-1", "omaha", "kansas_city", 1, "gray", "omaha-kansas_city"),
  r("omaha-kansas_city-2", "omaha", "kansas_city", 1, "gray", "omaha-kansas_city"),
  r("kansas_city-saint_louis-1", "kansas_city", "saint_louis", 2, "blue", "kansas_city-saint_louis"),
  r("kansas_city-saint_louis-2", "kansas_city", "saint_louis", 2, "purple", "kansas_city-saint_louis"),
  r("kansas_city-oklahoma_city-1", "kansas_city", "oklahoma_city", 2, "gray", "kansas_city-oklahoma_city"),
  r("kansas_city-oklahoma_city-2", "kansas_city", "oklahoma_city", 2, "gray", "kansas_city-oklahoma_city"),
  r("oklahoma_city-little_rock", "oklahoma_city", "little_rock", 2, "gray"),
  r("oklahoma_city-dallas-1", "oklahoma_city", "dallas", 2, "gray", "oklahoma_city-dallas"),
  r("oklahoma_city-dallas-2", "oklahoma_city", "dallas", 2, "gray", "oklahoma_city-dallas"),

  // Texas / Gulf
  r("dallas-little_rock", "dallas", "little_rock", 2, "gray"),
  r("dallas-houston-1", "dallas", "houston", 1, "gray", "dallas-houston"),
  r("dallas-houston-2", "dallas", "houston", 1, "gray", "dallas-houston"),
  r("houston-new_orleans", "houston", "new_orleans", 2, "gray"),
  r("little_rock-saint_louis", "little_rock", "saint_louis", 2, "gray"),
  r("little_rock-nashville", "little_rock", "nashville", 3, "white"),
  r("little_rock-new_orleans", "little_rock", "new_orleans", 3, "green"),
  r("new_orleans-atlanta-1", "new_orleans", "atlanta", 4, "yellow", "new_orleans-atlanta"),
  r("new_orleans-atlanta-2", "new_orleans", "atlanta", 4, "orange", "new_orleans-atlanta"),
  r("new_orleans-miami", "new_orleans", "miami", 6, "red"),

  // Midwest / East
  r("chicago-saint_louis", "chicago", "saint_louis", 2, "green"),
  r("chicago-toronto", "chicago", "toronto", 4, "white"),
  r("chicago-pittsburgh-1", "chicago", "pittsburgh", 3, "black", "chicago-pittsburgh"),
  r("chicago-pittsburgh-2", "chicago", "pittsburgh", 3, "orange", "chicago-pittsburgh"),
  r("saint_louis-nashville", "saint_louis", "nashville", 2, "gray"),
  r("nashville-atlanta", "nashville", "atlanta", 1, "gray"),
  r("nashville-pittsburgh", "nashville", "pittsburgh", 4, "yellow"),
  r("nashville-raleigh", "nashville", "raleigh", 3, "black"),
  r("atlanta-charleston", "atlanta", "charleston", 2, "gray"),
  r("atlanta-raleigh-1", "atlanta", "raleigh", 2, "gray", "atlanta-raleigh"),
  r("atlanta-raleigh-2", "atlanta", "raleigh", 2, "gray", "atlanta-raleigh"),
  r("atlanta-miami", "atlanta", "miami", 5, "blue"),
  r("charleston-miami", "charleston", "miami", 4, "purple"),
  r("charleston-raleigh", "charleston", "raleigh", 2, "gray"),
  r("raleigh-washington-1", "raleigh", "washington", 2, "gray", "raleigh-washington"),
  r("raleigh-washington-2", "raleigh", "washington", 2, "gray", "raleigh-washington"),
  r("raleigh-pittsburgh", "raleigh", "pittsburgh", 2, "gray"),
  r("pittsburgh-washington", "pittsburgh", "washington", 2, "gray"),
  r("pittsburgh-new_york-1", "pittsburgh", "new_york", 2, "white", "pittsburgh-new_york"),
  r("pittsburgh-new_york-2", "pittsburgh", "new_york", 2, "green", "pittsburgh-new_york"),
  r("pittsburgh-toronto", "pittsburgh", "toronto", 2, "gray"),
  r("toronto-montreal", "toronto", "montreal", 3, "gray"),
  r("toronto-sault_st_marie", "toronto", "sault_st_marie", 2, "gray"),
  r("sault_st_marie-montreal", "sault_st_marie", "montreal", 5, "black"),
  r("montreal-boston-1", "montreal", "boston", 2, "gray", "montreal-boston"),
  r("montreal-boston-2", "montreal", "boston", 2, "gray", "montreal-boston"),
  r("montreal-new_york", "montreal", "new_york", 3, "blue"),
  r("boston-new_york-1", "boston", "new_york", 2, "yellow", "boston-new_york"),
  r("boston-new_york-2", "boston", "new_york", 2, "red", "boston-new_york"),
  r("new_york-washington-1", "new_york", "washington", 2, "orange", "new_york-washington"),
  r("new_york-washington-2", "new_york", "washington", 2, "black", "new_york-washington"),
  r("washington-charleston", "washington", "charleston", 2, "gray"),
];
