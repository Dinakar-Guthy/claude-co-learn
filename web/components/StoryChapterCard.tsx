"use client";

import { useEffect, useRef } from "react";
import type { StoryChapter } from "@/lib/contracts/session";
import { Markdown } from "./Markdown";
import { useSounds } from "./SoundProvider";

export interface StoryChapterCardProps {
  /** Undefined while the chapter is still being written. */
  chapter?: Pick<StoryChapter, "id" | "title" | "text">;
  loading?: boolean;
  /** True when the chapter is revealed live (plays the unlock chime once). */
  live?: boolean;
}

export function StoryChapterCard({ chapter, loading = false, live = false }: StoryChapterCardProps) {
  const sounds = useSounds();
  const played = useRef<string | null>(null);
  const id = chapter?.id;
  useEffect(() => {
    if (live && id && played.current !== id) {
      played.current = id;
      sounds.play("unlock");
    }
  }, [live, id, sounds]);

  const pending = loading || !chapter;
  return (
    <section aria-label="Story chapter" aria-busy={pending || undefined} className="rounded-card border border-border bg-surface p-5 shadow-soft sm:p-7">
      <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
        <span aria-hidden="true" className="text-primary">✦ </span>
        {pending ? "Next chapter" : "Chapter unlocked"}
      </p>
      {pending ? (
        <div className="space-y-3" role="status">
          <p className="text-muted">Writing the next chapter of your story…</p>
          <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
            <div className="h-3 w-3/4 rounded-full bg-surface-2" />
            <div className="h-3 w-full rounded-full bg-surface-2" />
            <div className="h-3 w-5/6 rounded-full bg-surface-2" />
          </div>
        </div>
      ) : (
        <div aria-live={live ? "polite" : undefined}>
          <h3 className="mb-3 text-xl font-extrabold">{chapter.title}</h3>
          <Markdown className="text-[1.02rem] leading-loose">{chapter.text}</Markdown>
        </div>
      )}
    </section>
  );
}
