import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thiri — AI Sales Agent",
  description: "Messenger & Telegram AI အရောင်းဝန်ထမ်း နှင့် Bot Control Center",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="my" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Myanmar:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
