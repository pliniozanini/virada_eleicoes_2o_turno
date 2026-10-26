import React from 'react';
import { MapLayerId } from '../types/electoral';
import { TrendingUp } from 'lucide-react';

interface LayerSwitcherPanelProps {
  activeLayer: MapLayerId;
  onChangeLayer: (layer: MapLayerId) => void;
  onlyFlavioGrew: boolean;
  onToggleOnlyFlavioGrew: () => void;
  flavioGrewCount: number;
}

const LAYER_TABS: {
  id: MapLayerId;
  label: string;
}[] = [
  { id: 'dominant', label: 'Fator Dominante' },
  { id: 'flavio_loss', label: 'Sangria vs. Avanço 22' },
  { id: 'abstention', label: 'Queda de Abstenção' },
  { id: 'third_way', label: 'Força da 3ª Via' },
];

export const LayerSwitcherPanel: React.FC<LayerSwitcherPanelProps> = ({
  activeLayer,
  onChangeLayer,
  onlyFlavioGrew,
  onToggleOnlyFlavioGrew,
  flavioGrewCount,
}) => {
  return (
    <div className="bg-[#0F172A]/92 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-2.5 text-slate-100 max-w-[calc(100vw-24px)] space-y-2">
      {/* Segmented Layer Switcher + Filter for Rare Flavio Growth Cases */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-wrap items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-white/5">
          {LAYER_TABS.map((tab) => {
            const isActive = activeLayer === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChangeLayer(tab.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-xs border border-white/15'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Dedicated Filter Toggle for Rare Cases where Flavio Gained Votes in 2T */}
        <button
          onClick={onToggleOnlyFlavioGrew}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
            onlyFlavioGrew
              ? 'bg-sky-500 text-slate-950 border-sky-300 shadow-md'
              : 'bg-sky-950/50 text-sky-300 border-sky-500/35 hover:bg-sky-900/60'
          }`}
          title="Isolar no mapa os locais raros onde Flávio Bolsonaro ganhou votos no 2º turno em relação ao 1º turno"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Onde Flávio Cresceu (+22): {flavioGrewCount}</span>
        </button>
      </div>

      {/* Compact Single-Row Legend */}
      <div className="px-1 flex flex-wrap items-center justify-between gap-3 text-[11px]">
        {activeLayer === 'dominant' && (
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F43F5E]" />
              Sangria Flávio (22→13)
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B]" />
              Queda Abstenção
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#A855F7]" />
              Herança 3ª Via
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981]" />
              Brancos/Nulos
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-sky-300">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0EA5E9] ring-1 ring-white/50" />
              Avanço Flávio (+22 no 2ºT)
            </span>
          </div>
        )}

        {activeLayer === 'flavio_loss' && (
          <div className="flex items-center gap-3 w-full">
            <span className="font-mono text-rose-400 whitespace-nowrap">
              Sangria (-22% Flávio)
            </span>
            <div className="flex-1 grid grid-cols-6 gap-1 h-2 rounded overflow-hidden min-w-[140px]">
              <div className="bg-[#E11D48]" title="Forte sangria de Flávio (>22%)" />
              <div className="bg-[#F43F5E]" title="Sangria moderada (16%)" />
              <div className="bg-[#FDA4AF]" title="Leve perda (6%)" />
              <div className="bg-[#475569]" title="Estável" />
              <div className="bg-[#38BDF8]" title="Flávio cresceu (+8%)" />
              <div className="bg-[#0284C7]" title="Forte avanço de Flávio (+16%)" />
            </div>
            <span className="font-mono text-sky-400 whitespace-nowrap">
              Avanço (+16% Flávio)
            </span>
          </div>
        )}

        {activeLayer === 'abstention' && (
          <div className="flex items-center gap-3 w-full">
            <span className="text-slate-400 whitespace-nowrap">Queda de Abstenção:</span>
            <div className="flex-1 grid grid-cols-5 gap-1 h-2 rounded overflow-hidden min-w-[120px]">
              <div className="bg-[#38BDF8]" />
              <div className="bg-[#FDE68A]" />
              <div className="bg-[#FBBF24]" />
              <div className="bg-[#F59E0B]" />
              <div className="bg-[#D97706]" />
            </div>
            <span className="font-mono text-amber-400 whitespace-nowrap">-35%+ abst.</span>
          </div>
        )}

        {activeLayer === 'third_way' && (
          <div className="flex items-center gap-3 w-full">
            <span className="text-slate-400 whitespace-nowrap">Peso da 3ª Via no Salto:</span>
            <div className="flex-1 grid grid-cols-5 gap-1 h-2 rounded overflow-hidden min-w-[120px]">
              <div className="bg-[#334155]" />
              <div className="bg-[#D8B4FE]" />
              <div className="bg-[#C084FC]" />
              <div className="bg-[#A855F7]" />
              <div className="bg-[#9333EA]" />
            </div>
            <span className="font-mono text-purple-400 whitespace-nowrap">&gt;55% 3ª via</span>
          </div>
        )}
      </div>
    </div>
  );
};
