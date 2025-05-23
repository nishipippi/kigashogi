// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Google FontsからInterをインポート
import "./globals.css";

const inter = Inter({ subsets: ["latin"] }); // フォント設定

export const metadata: Metadata = {
  title: "KigaShogi",
  description: "A new RTS game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja"> {/* lang属性を 'ja' に変更 */}
      <body className={inter.className}>{children}</body> {/* classNameにフォントを適用 */}
    </html>
  );
}