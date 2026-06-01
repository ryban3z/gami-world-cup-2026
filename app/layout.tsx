import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gami World Cup '26",
  description:
    "The Gami All-Stars World Cup 2026 friends pool — snake-draft 48 nations, bonus predictions, and the race for the Golden Drumstick.",
  openGraph: {
    title: "Gami World Cup '26",
    description:
      "8 mates, 48 nations, one Golden Drumstick. Snake-draft pool for World Cup 2026.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
