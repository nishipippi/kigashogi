// src/app/results/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ResultsContent() {
    const searchParams = useSearchParams();
    const status = searchParams.get('status'); // 'win', 'lose', 'draw', 'surrender'
    const mapId = searchParams.get('mapId');
    // const playerVP = searchParams.get('playerVP');
    // const enemyVP = searchParams.get('enemyVP');

    let resultMessage = "Game Over";
    if (status === 'win') resultMessage = "Victory!";
    else if (status === 'lose') resultMessage = "Defeat!";
    else if (status === 'draw') resultMessage = "Draw!";
    else if (status === 'surrender') resultMessage = "You Surrendered.";


    return (
        <div className="flex flex-col min-h-screen items-center justify-center bg-gray-800 text-white p-8">
            <div className="bg-gray-900 p-10 rounded-xl shadow-2xl flex flex-col text-center w-full max-w-md">
                <h1 className={`text-6xl font-bold mb-6 ${
                    status === 'win' ? 'text-green-400' :
                    status === 'lose' || status === 'surrender' ? 'text-red-400' :
                    'text-yellow-400'
                }`}>
                    {resultMessage}
                </h1>
                <p className="mb-2">Map: {mapId || 'Unknown'}</p>
                {/* <p className="mb-2">Your Victory Points: {playerVP || 0}</p> */}
                {/* <p className="mb-6">Enemy Victory Points: {enemyVP || 0}</p> */}
                <p className="mb-8 text-gray-400">(Detailed stats will be shown here)</p>

                <div className="space-y-4 flex flex-col">
                    {/* <Button href={`/unit-deployment?mapId=${mapId}&mode=ai`} variant="primary" className="w-full"> {/* AI戦なら同じ設定で再戦など */}
                    {/* Replay (AI vs AI) */}
                    {/* </Button> */}
                    <Button href="/replay-list" variant="secondary" className="w-full">
                        View Replays (Not Implemented)
                    </Button>
                    <Button href="/main-menu" variant="ghost" className="w-full">
                        Back to Main Menu
                    </Button>
                </div>
            </div>
        </div>
    );
}
export default function ResultsScreen() {
  return (
    <Suspense fallback={<div>Loading results...</div>}>
      <ResultsContent />
    </Suspense>
  )
}