import React from 'react';
import Button from '@/components/ui/Button';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';

interface GameHeaderProps {
  onPause: () => void;
  onSurrender: () => void;
}

const GameHeader: React.FC<GameHeaderProps> = ({ onPause, onSurrender }) => {
  const currentMapDataFromStore = useGameSettingsStore(state => state.currentMapDataState);
  const mapIdParam = useGameSettingsStore(state => state.selectedMapId); // mapIdParamはuseSearchParamsから取得されるが、ここではストアから取得
  const gameTimeFromStore = useGameSettingsStore(state => state.gameTimeElapsed);
  const gameTimeLimit = useGameSettingsStore(state => state.gameTimeLimit);
  const playerResources = useGameSettingsStore(state => state.playerResources);
  const enemyResourcesStore = useGameSettingsStore(state => state.enemyResources);
  const victoryPoints = useGameSettingsStore(state => state.victoryPoints);
  const targetVictoryPoints = useGameSettingsStore(state => state.targetVictoryPoints);
  const gameOverMessage = useGameSettingsStore(state => state.gameOverMessage);

  return (
    <header className="h-16 bg-black bg-opacity-50 p-3 flex justify-between items-center shadow-lg z-10">
      <div className="flex items-center space-x-6">
        <div>KigaShogi</div>
        <div>Map: <span className="font-semibold">{currentMapDataFromStore?.name || mapIdParam || 'N/A'}</span></div>
        <div>Time: <span className="font-semibold">
            {Math.floor(gameTimeFromStore / 60).toString().padStart(2, '0')}:
            {(gameTimeFromStore % 60).toString().padStart(2, '0')}
        </span> / <span className="text-gray-400">
            {Math.floor(gameTimeLimit / 60).toString().padStart(2, '0')}:
            {(gameTimeLimit % 60).toString().padStart(2, '0')}
        </span></div>
      </div>
      <div className="flex items-center space-x-4">
        <div>P-Res: <span className="font-bold text-yellow-400">{playerResources}</span></div>
        <div>E-Res: <span className="font-bold text-orange-400">{enemyResourcesStore}</span></div>
        <div>VP:
          <span className="text-blue-400 font-semibold"> {victoryPoints.player}</span> /
          <span className="text-red-400 font-semibold"> {victoryPoints.enemy}</span> {}
          (<span className="text-gray-400">T: {targetVictoryPoints}</span>)
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <Button onClick={onPause} variant="secondary" size="sm">Pause</Button>
        <Button onClick={onSurrender} variant="danger" size="sm" disabled={!!gameOverMessage}>Surrender</Button>
      </div>
    </header>
  );
};

export default GameHeader;
