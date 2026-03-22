import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenCanopy | Conservation Mapping for BC",
  description:
    "Open-source interactive conservation mapping for British Columbia. Visualize old growth, carbon value, species at risk, and logging threats.",
  openGraph: {
    title: "OpenCanopy | Conservation Mapping for BC",
    description:
      "Open-source interactive conservation mapping for British Columbia. Visualize old growth, carbon value, species at risk, and logging threats.",
    type: "website",
    locale: "en_CA",
    siteName: "OpenCanopy",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenCanopy",
    description:
      "Open-source conservation mapping for BC. Old growth, carbon, species at risk.",
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
    <html
      lang="en"
      className={`${jakarta.variable} ${inter.variable} h-full antialiased dark`}
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </head>
      <body className="h-full bg-[#0a0a0c] text-white">{children}</body>
    </html>
  );
}
