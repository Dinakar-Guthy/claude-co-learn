import type { Metadata } from "next";
import { Nunito, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/ui/themeBoot";
import { TestModeBadge } from "@/components/TestModeBadge";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Co-learn",
  description: "Get real work done with Claude, and come out more capable.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script may set data-theme before hydration, so the attribute can differ from the server's.
    <html lang="en" data-theme="frost" suppressHydrationWarning className={`${nunito.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <TestModeBadge />
      </body>
    </html>
  );
}
