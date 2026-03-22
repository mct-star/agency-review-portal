import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGENCY Bristol | Healthcare Content Platform",
  description:
    "Three AI modules that work together: a Copy Engine that writes like you, Regulatory Review that catches what humans miss, and Creative AI that stops the scroll.",
  metadataBase: new URL("https://agency-review-portal.vercel.app"),
  openGraph: {
    title: "AGENCY Bristol | Healthcare Content Platform",
    description:
      "AI-powered healthcare content that takes minutes, not weeks. Voice-matched copy, MLR compliance review, and scroll-stopping visuals.",
    siteName: "AGENCY Bristol",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "AGENCY Bristol | Healthcare Content Platform",
    description:
      "AI-powered healthcare content that takes minutes, not weeks.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">{children}</body>
    </html>
  );
}
