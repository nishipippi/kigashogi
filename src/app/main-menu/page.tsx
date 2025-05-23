// src/app/main-menu/page.tsx
import Button from '@/components/ui/Button';

export default function MainMenu() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-12 bg-gray-800">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-xl shadow-2xl space-y-6">
        <h1 className="text-5xl font-bold text-center text-white mb-10">Main Menu</h1>
        <Button href="/game-mode-selection" variant="primary" size="lg" className="w-full">
          Game Start
        </Button>
        <Button href="/options" variant="secondary" size="lg" className="w-full">
          Options
        </Button>
        <Button variant="danger" size="lg" className="w-full" onClick={() => alert('Exit game functionality to be implemented!')}>
          Exit Game
        </Button>
        <div className="pt-6 text-center">
          <Button href="/" variant="ghost" size="sm">
            Back to Title
          </Button>
        </div>
      </div>
    </div>
  );
}