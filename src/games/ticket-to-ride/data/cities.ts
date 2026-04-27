import type { City } from "../types";

/**
 * 30 şehir. Koordinatlar 0–100 arası SVG viewBox yüzdelerinde
 * (x: doğu-batı, y: kuzey-güney). Days of Wonder USA haritasına
 * yaklaşık konumlandırma.
 */
export const CITIES: City[] = [
  { id: "vancouver", name: "Vancouver", x: 14, y: 12 },
  { id: "calgary", name: "Calgary", x: 22, y: 12 },
  { id: "winnipeg", name: "Winnipeg", x: 38, y: 14 },
  { id: "sault_st_marie", name: "Sault St. Marie", x: 58, y: 22 },
  { id: "montreal", name: "Montréal", x: 73, y: 22 },
  { id: "toronto", name: "Toronto", x: 65, y: 28 },
  { id: "boston", name: "Boston", x: 84, y: 30 },
  { id: "new_york", name: "New York", x: 80, y: 36 },
  { id: "washington", name: "Washington", x: 78, y: 44 },
  { id: "seattle", name: "Seattle", x: 12, y: 18 },
  { id: "portland", name: "Portland", x: 10, y: 24 },
  { id: "helena", name: "Helena", x: 27, y: 24 },
  { id: "duluth", name: "Duluth", x: 49, y: 26 },
  { id: "chicago", name: "Chicago", x: 56, y: 34 },
  { id: "pittsburgh", name: "Pittsburgh", x: 70, y: 38 },
  { id: "raleigh", name: "Raleigh", x: 73, y: 50 },
  { id: "san_francisco", name: "San Francisco", x: 8, y: 42 },
  { id: "salt_lake_city", name: "Salt Lake City", x: 22, y: 38 },
  { id: "denver", name: "Denver", x: 33, y: 42 },
  { id: "omaha", name: "Omaha", x: 47, y: 36 },
  { id: "kansas_city", name: "Kansas City", x: 48, y: 42 },
  { id: "saint_louis", name: "Saint Louis", x: 56, y: 42 },
  { id: "nashville", name: "Nashville", x: 62, y: 48 },
  { id: "atlanta", name: "Atlanta", x: 67, y: 54 },
  { id: "charleston", name: "Charleston", x: 76, y: 56 },
  { id: "los_angeles", name: "Los Angeles", x: 14, y: 56 },
  { id: "las_vegas", name: "Las Vegas", x: 19, y: 50 },
  { id: "phoenix", name: "Phoenix", x: 24, y: 56 },
  { id: "santa_fe", name: "Santa Fe", x: 32, y: 52 },
  { id: "oklahoma_city", name: "Oklahoma City", x: 44, y: 52 },
  { id: "el_paso", name: "El Paso", x: 32, y: 60 },
  { id: "dallas", name: "Dallas", x: 46, y: 60 },
  { id: "little_rock", name: "Little Rock", x: 53, y: 54 },
  { id: "houston", name: "Houston", x: 50, y: 68 },
  { id: "new_orleans", name: "New Orleans", x: 58, y: 66 },
  { id: "miami", name: "Miami", x: 80, y: 76 },
];
