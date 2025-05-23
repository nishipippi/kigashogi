// src/app/options/page.tsx
import Link from 'next/link';

export default function OptionsScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1>Options Screen</h1>
      {/* オプション項目は後で実装 */}
      <p className="my-8">Options will be here...</p>
      <Link href="/main-menu" className="px-6 py-3 bg-gray-500 hover:bg-gray-600 rounded">
        Back to Main Menu
      </Link>
    </div>
  );
}