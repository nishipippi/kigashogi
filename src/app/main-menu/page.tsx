// src/app/main-menu/page.tsx
"use client"; // この行を追加

import Button from '@/components/ui/Button';
// Link はサーバーコンポーネントでもクライアントコンポーネントでも使えますが、
// "use client" があるファイルでは、インポートされるものもクライアントサイドで動作します。

export default function MainMenu() {
  // onClickなどのイベントハンドラを使用するため、このコンポーネントはクライアントコンポーネントである必要がある
  const handleExitClick = () => {
    // 将来的には終了確認ダイアログなどを表示
    alert('Exit game functionality to be implemented!');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-12 bg-gray-800">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-xl shadow-2xl flex flex-col space-y-6 text-center">
        <h1 className="text-5xl font-bold text-center text-white mb-10">Main Menu</h1>
        <Button href="/game-mode-selection" variant="primary" size="lg" className="w-full">
          Game Start
        </Button>
        <Button href="/options" variant="secondary" size="lg" className="w-full">
          Options
        </Button>
        <Button variant="danger" size="lg" className="w-full" onClick={handleExitClick}>
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