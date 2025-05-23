// src/app/loading/page.tsx
"use client"; // useEffectを使う可能性があるので念のため

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function LoadingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const mapId = searchParams.get('mapId');
    // const mode = searchParams.get('mode'); // 必要なら

    useEffect(() => {
        // ここでアセットの読み込みやゲーム初期化処理を行う想定
        const timer = setTimeout(() => {
            console.log(`Loading complete for map: ${mapId}. Navigating to gameplay...`);
            router.push(`/gameplay?mapId=${mapId}`); // ゲームプレイ画面へ
        }, 3000); // 3秒後に遷移 (仮)

        return () => clearTimeout(timer);
    }, [router, mapId]);

    return (
        <div className="flex flex-col min-h-screen items-center justify-center bg-gray-900 text-white">
            <h1 className="text-4xl font-bold mb-4 animate-pulse">Loading KigaShogi...</h1>
            <p className="text-xl">Preparing map: {mapId || "Unknown Map"}</p>
            {/* プログレスバーなどをここに追加 */}
            <div className="w-1/2 bg-gray-700 rounded-full h-2.5 mt-8">
                <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: "75%" }}></div> {/* 仮の進捗 */}
            </div>
        </div>
    );
}

export default function LoadingScreen() {
  return (
    <Suspense fallback={<div>Loading screen itself...</div>}>
      <LoadingContent />
    </Suspense>
  )
}