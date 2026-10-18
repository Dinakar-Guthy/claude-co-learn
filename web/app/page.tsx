import { Suspense } from "react";
import { HomeFlow } from "./HomeFlow";

export default function HomePage() {
  return (
    <Suspense>
      <HomeFlow />
    </Suspense>
  );
}
