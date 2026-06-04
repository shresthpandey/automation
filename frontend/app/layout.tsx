import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConverseOS - Omnichannel Chat Workspace",
  description: "Enterprise-grade conversational workspace for WhatsApp, Live Chat and autonomous AI routing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
