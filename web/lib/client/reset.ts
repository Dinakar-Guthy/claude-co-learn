import type { UserView } from "@/lib/contracts/api";
import { applyTheme, DEFAULT_THEME } from "@/lib/themes";
import { rememberTheme } from "@/lib/ui/themeBoot";
import { apiPost } from "./api";

/** Gives this browser a fresh Co-learn identity and puts the default theme back. */
export async function startOverAsNewUser(): Promise<UserView> {
  const user = await apiPost<UserView>("/api/user/reset", {});
  rememberTheme(DEFAULT_THEME);
  applyTheme(DEFAULT_THEME);
  return user;
}
