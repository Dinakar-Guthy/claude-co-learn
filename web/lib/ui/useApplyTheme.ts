"use client";

import { useEffect } from "react";
import { applyTheme } from "@/lib/themes";

/** Keeps <html data-theme> in sync with the user's chosen theme. */
export function useApplyTheme(themeId: string | undefined) {
  useEffect(() => {
    if (themeId) applyTheme(themeId);
  }, [themeId]);
}
