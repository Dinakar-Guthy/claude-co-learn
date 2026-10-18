import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { Workspace } from "./Workspace";

/** /s/[id]: the Co-learn workspace for one session (all state is loaded client-side from the API). */
export default function SessionPage({ params }: PageProps<"/s/[id]">) {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <Spinner label="Loading your session" />
        </main>
      }
    >
      <SessionFromParams params={params} />
    </Suspense>
  );
}

async function SessionFromParams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Workspace sessionId={id} />;
}
