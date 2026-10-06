import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/lib/store/AppProvider";
import { BRAND, BRAND_ASSETS } from "@/lib/brand";
import { DEFAULT_LOCALE, localeConfig } from "@/lib/i18n";
import { themeInitScript } from "@/lib/theme";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute URLs for social previews; set NEXT_PUBLIC_APP_URL in production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: BRAND.title, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/brand/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
  },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "ar_AR",
    siteName: BRAND.name,
    title: BRAND.title,
    description: BRAND.description,
    images: [{ url: BRAND_ASSETS.ogImage.src, width: BRAND_ASSETS.ogImage.width, height: BRAND_ASSETS.ogImage.height, alt: BRAND.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.title,
    description: BRAND.description,
    images: [BRAND_ASSETS.ogImage.src],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#283618" },
    { media: "(prefers-color-scheme: dark)", color: "#12170d" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, dir } = localeConfig[DEFAULT_LOCALE];
  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint (no flash of the wrong theme). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:rounded-xl focus:bg-forest focus:px-4 focus:py-2 focus:text-cream"
        >
          تخطَّ إلى المحتوى
        </a>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
