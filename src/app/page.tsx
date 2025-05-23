// src/app/page.tsx (これがタイトル画面 / になります)
import Link from 'next/link';

export default function TitleScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-6xl font-bold mb-8">KigaShogi</h1>
      <p className="text-xl mb-12">Press Any Key or Click to Start</p>
      {/* Next.js 13以降のApp Routerでは、ページ全体をLinkにするより、
          インタラクティブな要素（例：ボタン）でナビゲーションをトリガーするのが一般的。
          ここではシンプルにメインメニューへのリンクを設置します。 */}
      <Link href="/main-menu" className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl">
        Start Game (Go to Main Menu)
      </Link>
    </main>
  );
}