// src/app/main-menu/page.tsx
import Link from 'next/link';

export default function MainMenu() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1>Main Menu</h1>
      <nav className="flex flex-col space-y-4 mt-8">
        <Link href="/game-mode-selection" className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded">
          Game Start
        </Link>
        <Link href="/options" className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded">
          Options
        </Link>
        {/* 終了はダイアログ経由などになるため、ここでは一旦コメントアウト */}
        {/* <button className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded">Exit</button> */}
        <Link href="/" className="mt-8 text-sm text-gray-400 hover:text-gray-200">
          Back to Title
        </Link>
      </nav>
    </div>
  );
}