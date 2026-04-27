"use client";

import { createGameStore } from "@/platform/store";
import type { TtrState } from "./types";
import type { ServerEvent } from "./protocol";

export const useTtrStore = createGameStore<TtrState, ServerEvent>();
