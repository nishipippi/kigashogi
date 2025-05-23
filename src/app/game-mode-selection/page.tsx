// src/app/game-mode-selection/page.tsx
import Button from '@/components/ui/Button';

export default function GameModeSelectionScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-12 bg-gray-800">
      <div className="w-full max-w-lg p-8 bg-gray-900 rounded-xl shadow-2xl flex flex-col space-y-5 text-center">
        <h1 className="text-4xl font-bold text-center text-white mb-8">Select Game Mode</h1>
        <Button href="/online-lobby" variant="primary" size="lg" className="w-full">
          1v1 Online Battle
        </Button>
        <Button href="/ai-setup" variant="primary" size="lg" className="w-full">
          1v1 AI Battle
        </Button>
        <Button href="/tutorial-selection" variant="secondary" size="lg" className="w-full">
          Tutorial
        </Button>
        <Button href="/replay-list" variant="secondary" size="lg" className="w-full">
          Replay
        </Button>
        <div className="pt-5 text-center">
          <Button href="/main-menu" variant="ghost" size="sm">
            Back to Main Menu
          </Button>
        </div>
      </div>
    </div>
  );
}