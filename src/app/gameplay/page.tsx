// src/app/gameplay/page.tsx
import Link from 'next/link';

export default function GameplayScreen() {
  // この画面は実際には複雑なUIとロジックを持つ
  // 現時点ではプレースホルダー
  return (
    <div className="flex min-h-screen flex-col items-center justify-start p-4">
      <header className="w-full p-4 bg-gray-800 flex justify-between items-center">
        <h1>KigaShogi - Gameplay</h1>
        <Link href="/main-menu" className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm">
          Quit to Main Menu (Placeholder)
        </Link>
      </header>
      <div className="flex-grow w-full flex items-center justify-center">
        <p className="text-2xl">Game Area - To be implemented</p>
      </div>
      {/* 実際のゲームUIはここに */}
    </div>
  );
}