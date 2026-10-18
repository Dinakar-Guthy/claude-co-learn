/**
 * P0 STAND-IN — Track D replaces this file with real structured Claude calls (lib/contracts/content.ts).
 */
import type { ContentApi } from "@/lib/contracts/content";

const notYet = (name: string) => () => Promise.reject(new Error(`content.${name} not implemented yet (Track D)`));

export const content: ContentApi = {
  gradeAnswer: notYet("gradeAnswer"),
  verifyMoment: async () => ({ ok: true }),
  generateSketch: notYet("generateSketch"),
  generateBoss: notYet("generateBoss"),
  generateStoryBible: notYet("generateStoryBible"),
  generateChapter: notYet("generateChapter"),
  generateWrapUp: notYet("generateWrapUp"),
};
