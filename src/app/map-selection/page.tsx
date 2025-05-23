// src/app/map-selection/page.tsx
"use client";

import Button from '@/components/ui/Button';
// import Link from 'next/link'; // ButtonがLinkを内包
import { useSearchParams, useRouter } from 'next/navigation'; // useRouterを追加
import { Suspense } from 'react';
import { useGameSettingsStore } from '@/stores/gameSettingsStore'; // ストアをインポート
import { ALL_MAPS_DATA, MAP_OPTIONS } from '@/gameData/maps'; // マップデータをインポート

function MapSelectionContent() {
  const searchParams = useSearchParams();
  const router = useRouter(); // useRouterフックを使用
  const mode = searchParams.get('mode');

  const { setSelectedMapId, selectedMapId: currentSelectedMapId } = useGameSettingsStore(); // ストアからアクションと現在のマップIDを取得

  const backLink = mode === 'ai' ? '/ai-setup' : '/online-lobby';
  const nextLinkBase = '/unit-deployment';

  const handleMapSelect = (mapId: string) => {
    setSelectedMapId(mapId); // ストアにマップIDを保存
    // クエリパラメータも維持しつつ、次のページへ遷移
    router.push(`${nextLinkBase}?mapId=${mapId}&mode=${mode || ''}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-800">
      <div className="w-full max-w-2xl p-8 bg-gray-900 rounded-xl shadow-2xl">
        <h1 className="text-3xl font-bold text-center text-white mb-8">
          Select Map {mode && `(Mode: ${mode.toUpperCase()})`}
        </h1>

        <div className="space-y-4 mb-8">
          {MAP_OPTIONS.map(map => (
            <div
              key={map.id}
              className={`p-4 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors cursor-pointer
                          ${currentSelectedMapId === map.id ? 'ring-2 ring-blue-500' : ''}`} // 選択されているマップを強調
              onClick={() => handleMapSelect(map.id)} // div全体をクリック可能に
            >
              <h2 className="text-xl font-semibold text-white">{map.name}</h2>
              <p className="text-sm text-gray-300">Size: {ALL_MAPS_DATA[map.id]?.cols}x{ALL_MAPS_DATA[map.id]?.rows}</p> {/* 詳細情報を表示 */}
              {/* ボタンは視覚的な補助として残しても良いし、divのクリックに任せても良い */}
              <div className="mt-2">
                 <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation(); // 親divのonClickが発火しないように
                        handleMapSelect(map.id);
                    }}
                 >
                   Select this Map
                 </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-6">
          <Button href={backLink} variant="ghost" size="md">
            Back
          </Button>
        </div>
        {/* デバッグ用に現在の選択マップIDを表示 */}
        <div className="mt-4 p-3 bg-gray-700 rounded text-xs">
          <p>Debug - Current Selected Map ID: {currentSelectedMapId || 'None'}</p>
        </div>
      </div>
    </div>
  );
}

export default function MapSelectionScreen() {
  return (
    <Suspense fallback={<div>Loading map options...</div>}>
      <MapSelectionContent />
    </Suspense>
  );
}