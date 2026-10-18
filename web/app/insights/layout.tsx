import type { Metadata } from "next";

/** /insights is an owner dashboard (behind the site password); keep it out of search indexes. */
export const metadata: Metadata = {
  title: "Insights · Co-learn",
  robots: { index: false, follow: false },
};

export default function InsightsLayout({ children }: LayoutProps<"/insights">) {
  return children;
}
