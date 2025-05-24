import React from 'react';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';
import type { SelectedHexInfo, TerrainType } from '@/types/map';

interface HexInfoPanelProps {
  selectedHexInfo: SelectedHexInfo | null;
}

const HexInfoPanel: React.FC<HexInfoPanelProps> = ({ selectedHexInfo }) => {
  return (
    <>
      <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4">Hex Information</h2>
      {selectedHexInfo ? (
        <div className="text-sm space-y-1">
          <p>Q: {selectedHexInfo.q}, R: {selectedHexInfo.r}</p>
          <p>Logical X: {selectedHexInfo.logicalX}, Y: {selectedHexInfo.logicalY}</p>
          <p>Terrain: <span className="capitalize">{selectedHexInfo.terrain.replace(/_/g, ' ')}</span></p>
          {selectedHexInfo.terrain === 'forest' && <p className="text-green-300">効果: 視界が制限され、防御ボーナスがあります。</p>}
          {selectedHexInfo.terrain === 'hills' && <p className="text-gray-300">効果: 高台からの射撃にボーナスがあります。</p>}
          {selectedHexInfo.terrain === 'road' && <p className="text-yellow-300">効果: 移動速度が向上します。</p>}
          {selectedHexInfo.terrain === 'city' && <p className="text-blue-300">効果: 防御ボーナスがあり、視界が制限されます。</p>}
          {selectedHexInfo.terrain === 'water' && <p className="text-blue-300">効果: ほとんどのユニットは移動できません。</p>}
          {selectedHexInfo.terrain === 'mountain' && <p className="text-gray-300">効果: 移動が非常に困難で、視界が制限されます。</p>}
          {selectedHexInfo.terrain === 'swamp' && <p className="text-purple-300">効果: 移動速度が低下し、視界が制限されます。</p>}
          {selectedHexInfo.terrain === 'plains' && <p className="text-green-300">効果: 標準的な地形です。</p>}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No hex selected.</p>
      )}
    </>
  );
};

export default HexInfoPanel;
