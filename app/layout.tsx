import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./release-ui.css";
import { CartProvider } from "@/components/cart-provider";

export const metadata: Metadata = {
  title: {
    default: "شاخ ستور | بازاڕی ئۆنلاین",
    template: "%s | شاخ ستور",
  },
  description: "پلاتفۆرمی شاخ ستور بۆ کڕین و گەیاندنی خواردن و پێداویستییەکان.",
  applicationName: "Shakh Store",
};

export const viewport: Viewport = {
  themeColor: "#f56b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ckb" dir="rtl" data-scroll-behavior="smooth">
      <body><CartProvider>{children}</CartProvider></body>
    </html>
  );
}