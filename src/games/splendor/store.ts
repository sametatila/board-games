"use client";

import { createGameStore } from "@/platform/store";
import type { SplendorState } from "./types";
import type { ServerEvent } from "./protocol";

/**
 * Per-room Splendor store. Same shape as the platform's generic store
 * but typed against this game's state + events.
 */
export const useSplendorStore = createGameStore<SplendorState, ServerEvent>();
