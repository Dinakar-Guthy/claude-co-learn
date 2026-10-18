import type { Metadata } from "next";
import { Suspense } from "react";
import { CodexView } from "./CodexView";

export const metadata: Metadata = { title: "Codex · Co-learn" };

/** /codex: everything the learner has practised across sessions (loaded client-side from GET /api/codex). */
export default function CodexPage() {
  return (
    <Suspense>
      <CodexView />
    </Suspense>
  );
}
