import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/ui/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans-family" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Quoridor", template: "%s — Quoridor" },
  description: "Play Quoridor online in real time with a friend. Share a link, set a clock, place your walls.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/pwa-icon/192" },
  appleWebApp: { capable: true, title: "Quoridor", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111315" },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem('q:theme');t=t?JSON.parse(t):'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);var b=localStorage.getItem('q:boardTheme');if(b)document.documentElement.dataset.board=JSON.parse(b);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
