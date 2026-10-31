"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { IdeSession } from "./session";
import type { IdeState } from "./store";

export const SessionContext = createContext<IdeSession | null>(null);

export function useSession(): IdeSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside <WebCodeEditor>");
  return s;
}

export function useIde<T>(selector: (s: IdeState) => T): T {
  return useStore(useSession().store, selector);
}
