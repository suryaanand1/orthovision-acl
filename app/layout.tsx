import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrthoVision ACL | Movement Assessment",
  description: "Phone-based single-leg squat assessment for ACL rehabilitation.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
