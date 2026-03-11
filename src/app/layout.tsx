import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGENCY Bristol | Content Review",
  description: "Client content review and approval portal",
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
