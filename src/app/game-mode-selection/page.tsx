// src/app/game-mode-selection/page.tsx
import Link from 'next/link';

export default function GameModeSelectionScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1>Game Mode Selection</h1>
      <nav className="flex flex-col space-y-4 mt-8">
        <Link href="/online-lobby" className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded">
          1v1 Online Battle
        </Link>
        <Link href="/ai-setup" className="px-6 py-3 bg-teal-500 hover:bg-teal-600 rounded">
          1v1 AI Battle
        </Link>
        <Link href="/tutorial-selection" className="px-6 py-3 bg-purple-500 hover:bg-purple-600 rounded">
          Tutorial
        </Link>
        <Link href="/replay-list" className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 rounded">
          Replay
        </Link>
        <Link href="/main-menu" className="mt-8 text-sm text-gray-400 hover:text-gray-200">
          Back to Main Menu
        </Link>
      </nav>
    </div>
  );
}