import { customAlphabet } from "nanoid";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generate = customAlphabet(ROOM_ALPHABET, 6);

export function generateRoomCode(): string {
  return generate();
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== 6) return false;
  for (const ch of code) {
    if (!ROOM_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
