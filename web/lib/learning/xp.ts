/** Server-side XP awarding: the client is never trusted with XP (design-plan §5.3, §12). */
import type { XpEvent } from "@/lib/contracts/engine";
import type { User } from "@/lib/contracts/session";
import type { XpAward } from "@/lib/contracts/stream";
import { newUser } from "@/lib/store/defaults";
import type { LearningDeps } from "./deps";

export async function loadUser(deps: LearningDeps, anonId: string): Promise<User> {
  return (await deps.store.getUser(anonId)) ?? newUser(anonId, deps.now());
}

/**
 * Adds the XP for `events` to the user's total, applies level rewards to their unlocks, and logs
 * level-ups. Returns undefined when the events are worth nothing.
 */
export async function awardXp(
  deps: LearningDeps,
  anonId: string,
  sessionId: string,
  events: XpEvent[],
  reason: string,
): Promise<XpAward | undefined> {
  const amount = events.reduce((sum, e) => sum + deps.engine.xpFor(e), 0);
  if (amount <= 0) return undefined;

  const user = await loadUser(deps, anonId);
  const before = deps.engine.levelFor(user.xp);
  const xp = user.xp + amount;
  const after = deps.engine.levelFor(xp);

  const award: XpAward = { amount, reason, level: after };
  const next: User = { ...user, xp, level: after.level, unlocks: { themes: [...user.unlocks.themes], soundPacks: [...user.unlocks.soundPacks] } };

  if (after.level > before.level) {
    const rewards = deps.engine.rewardsBetween(before.level, after.level);
    for (const r of rewards) {
      const list = r.kind === "theme" ? next.unlocks.themes : next.unlocks.soundPacks;
      if (!list.includes(r.id)) list.push(r.id);
    }
    award.levelUp = { from: before.level, to: after.level, rewards };
    await deps.store.logEvent({
      at: deps.now(),
      anonId,
      sessionId,
      name: "level_up",
      props: { from: before.level, to: after.level, rewards: rewards.map((r) => r.id).join(",") || null },
    });
  }

  await deps.store.putUser(next);
  return award;
}
