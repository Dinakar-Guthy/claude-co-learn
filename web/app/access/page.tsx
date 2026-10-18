import { Suspense } from "react";
import { AccessForm } from "./AccessForm";

export default function AccessPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold text-text">Co-learn preview</h1>
      <p className="text-sm text-muted">Enter the access password you were given.</p>
      <Suspense>
        <AccessForm />
      </Suspense>
    </main>
  );
}
