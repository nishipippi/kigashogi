// src/app/ai-setup/page.tsx
"use client"; // クライアントコンポーネントであることを確認

import Button from '@/components/ui/Button';
// import Link from 'next/link'; // ButtonがLinkを内包するため不要になる場合あり
import {
  useGameSettingsStore,
  aiDifficultiesList, // 名前に "List" を追加
  factionsList,       // 名前に "List" を追加
  initialCostsList    // 名前に "List" を追加
} from '@/stores/gameSettingsStore';
import type { AiDifficulty, Faction, InitialCost } from '@/stores/gameSettingsStore'; // 型もインポート

export default function AiBattleSetupScreen() {
  // Zustandストアから状態とアクションを取得
  const {
    aiDifficulty,
    playerFaction,
    // enemyFaction, // 今回はプレイヤー勢力のみ設定
    initialCost,
    setAiDifficulty,
    setPlayerFaction,
    // setEnemyFaction,
    setInitialCost,
  } = useGameSettingsStore();

  const handleAiDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAiDifficulty(e.target.value as AiDifficulty);
  };

  const handlePlayerFactionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPlayerFaction(e.target.value as Faction);
  };

  const handleInitialCostChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setInitialCost(Number(e.target.value) as InitialCost);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-800">
      <div className="w-full max-w-xl p-8 bg-gray-900 rounded-xl shadow-2xl space-y-6">
        <h1 className="text-3xl font-bold text-center text-white mb-8">AI Battle Setup</h1>

        {/* AI Difficulty */}
        <div className="space-y-2">
          <label htmlFor="ai-difficulty" className="block text-sm font-medium text-gray-300">
            AI Difficulty
          </label>
          <select
            id="ai-difficulty"
            name="ai-difficulty"
            className="block w-full p-2.5 bg-gray-700 border border-gray-600 placeholder-gray-400 text-white focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm"
            value={aiDifficulty} // ストアの状態をバインド
            onChange={handleAiDifficultyChange} // 変更時にストアを更新
          >
            {aiDifficultiesList.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Player Faction */}
        <div className="space-y-2">
          <label htmlFor="player-faction" className="block text-sm font-medium text-gray-300">
            Your Faction
          </label>
          <select
            id="player-faction"
            name="player-faction"
            className="block w-full p-2.5 bg-gray-700 border border-gray-600 placeholder-gray-400 text-white focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm"
            value={playerFaction} // ストアの状態をバインド
            onChange={handlePlayerFactionChange} // 変更時にストアを更新
          >
            {factionsList.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Initial Cost */}
        <div className="space-y-2">
          <label htmlFor="initial-cost" className="block text-sm font-medium text-gray-300">
            Initial Cost
          </label>
          <select
            id="initial-cost"
            name="initial-cost"
            className="block w-full p-2.5 bg-gray-700 border border-gray-600 placeholder-gray-400 text-white focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm"
            value={initialCost} // ストアの状態をバインド
            onChange={handleInitialCostChange} // 変更時にストアを更新
          >
            {initialCostsList.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-between items-center pt-6">
          <Button href="/game-mode-selection" variant="ghost" size="md">
            Back
          </Button>
          <Button href="/map-selection?mode=ai" variant="primary" size="lg">
            Proceed to Map Selection
          </Button>
        </div>
        {/* デバッグ用に現在のストアの状態を表示 */}
        <div className="mt-4 p-3 bg-gray-700 rounded text-xs">
          <p>Debug - Current Settings:</p>
          <p>AI Difficulty: {aiDifficulty}</p>
          <p>Player Faction: {playerFaction}</p>
          <p>Initial Cost: {initialCost}</p>
        </div>
      </div>
    </div>
  );
}