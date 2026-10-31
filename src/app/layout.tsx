import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Vixx",
  description: "Planlægning og timeregistrering for køreskoler",
  // Lagt på hjemmeskærmen åbner appen uden browserens adresselinje.
  appleWebApp: { capable: true, title: "Vixx", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f5f4f2",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
