import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenCanopy | Map",
  description:
    "Interactive conservation map for British Columbia. Visualize old growth, carbon value, species at risk, and logging threats using real-time BC government data.",
};

export default function MapLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
