import type { Metadata } from "next";

/** /dev is a component showcase for development; keep it out of search indexes. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: LayoutProps<"/dev">) {
  return children;
}
