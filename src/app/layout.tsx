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
    <html lang="ja">
      <body className={`${inter.className} bg-gray-900 text-gray-100`}> {/* bodyに基本の背景色と文字色 */}
        <div className="container mx-auto px-4 py-8 min-h-screen flex flex-col"> {/* コンテナでラップ */}
          {children}
        </div>
      </body>
    </html>
  );
}