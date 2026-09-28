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
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}