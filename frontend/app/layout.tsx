import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Facts Check — Verify every claim against its sources",
  description:
    "Verify RAG-generated answers against source documents. Claims are extracted, checked against the evidence, and scored.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JetBrains Mono for the reactor backdrop's technical annotations */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}