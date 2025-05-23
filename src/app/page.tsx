// src/app/page.tsx
// import Link from 'next/link'; // ButtonコンポーネントがLinkを内包するため不要になることも
import Button from '@/components/ui/Button'; // Buttonコンポーネントをインポート (エイリアス @/ が設定されていれば)
                                          // もしエイリアスがなければ、相対パスで '../components/ui/Button' など

export default function TitleScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-cover bg-center" style={{backgroundImage: "url('/images/title-background.jpg')"}}> {/* 背景画像例 */}
      <div className="bg-black bg-opacity-50 p-10 rounded-lg shadow-xl text-center">
        <h1 className="text-7xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
          KigaShogi
        </h1>
        <p className="text-xl mb-10 text-gray-300">The Next Generation Tactical Battle</p>
        <Button href="/main-menu" variant="primary" size="lg">
          Start Game
        </Button>
      </div>
    </main>
  );
}