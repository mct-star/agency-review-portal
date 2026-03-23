import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AGENCY | Content Platform",
    template: "%s | AGENCY",
  },
  description:
    "Your weekly demand ecosystem, deployed in minutes. Voice-matched AI content, regulatory compliance, and cinematic-quality visuals.",
  metadataBase: new URL("https://agency-review-portal.vercel.app"),
  openGraph: {
    title: "AGENCY | Content Platform",
    description:
      "You have the expertise. You just don't have the time to share it. AI-powered content that sounds like you, looks incredible, and posts itself.",
    siteName: "AGENCY",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "AGENCY | Content Platform",
    description:
      "Your weekly demand ecosystem, deployed in minutes.",
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
