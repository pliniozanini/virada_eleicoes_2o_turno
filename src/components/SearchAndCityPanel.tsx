import React, { useMemo, useState } from 'react';
import { Search, X, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import {
  CityQuickJump,
  MapLayerId,
  MunicipioEleitoral,
  SetorVotacao,
} from '../types/electoral';
import { FACTOR_META } from '../utils/heuristicEngine';
import {
  ALL_5570_MUNICIPIOS,
  ALL_UFS,
  getEffectiveDominantFactor,
  getOrGenerateMunicipioSetores,
} from '../utils/municipioVoronoiGenerator';

interface SearchAndCityPanelProps {
  setores: SetorVotacao[];
  cidades: CityQuickJump[];
  activeCity: string;
  activeLayer: MapLayerId;
  onChangeLayer: (layer: MapLayerId) => void;
  showFlavioGrew: boolean;
  onToggleShowFlavioGrew: () => void;
  onSelectCity: (city: CityQuickJump | null) => void;
  onSelectSetor: (setor: SetorVotacao, highlightSecao?: number) => void;
  onSelectMunicipio: (mun: MunicipioEleitoral, generatedSetores: SetorVotacao[]) => void;
}

const LAYER_OPTIONS: { id: MapLayerId; label: string }[] = [
  { id: 'dominant', label: 'Origem Predominante' },
  { id: 'flavio_loss', label: 'Transferência 22 → 13' },
  { id: 'abstention', label: 'Redução de Abstenção' },
  { id: 'third_way', label: 'Realinhamento 3ª Via' },
];

export const SearchAndCityPanel: React.FC<SearchAndCityPanelProps> = ({
  setores,
  cidades,
  activeCity,
  activeLayer,
  onChangeLayer,
  showFlavioGrew,
  onToggleShowFlavioGrew,
  onSelectCity,
  onSelectSetor,
  onSelectMunicipio,
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [selectedUf, setSelectedUf] = useState<string>('TODAS');

  const ufMunicipios = useMemo(() => {
    const list =
      selectedUf === 'TODAS'
        ? ALL_5570_MUNICIPIOS.filter((m) => m.capital)
        : ALL_5570_MUNICIPIOS.filter((m) => m.uf === selectedUf);
    return [...list].sort((a, b) => {
      if (a.capital !== b.capital) return a.capital ? -1 : 1;
      return b.eleitores - a.eleitores;
    });
  }, [selectedUf]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { municipios: [], setoresMatch: [] };

    const secaoMatch = q.match(/(?:se[cç][aã]o\s*)?(\d{3})\b/);
    const searchedSecaoNum = secaoMatch ? parseInt(secaoMatch[1], 10) : null;

    const matchedMunicipios = ALL_5570_MUNICIPIOS.filter(
      (m) =>
        m.nome.toLowerCase().includes(q) ||
        `${m.nome.toLowerCase()}/${m.uf.toLowerCase()}`.includes(q) ||
        String(m.ibge).includes(q) ||
        m.uf.toLowerCase() === q
    )
      .sort((a, b) => {
        const aStarts = a.nome.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.nome.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.eleitores - a.eleitores;
      })
      .slice(0, 6);

    const matchedSetores = setores
      .map((setor) => {
        const startSec = setor.secao_start || 101;
        const countSec = setor.secoes_count || setor.secoes_internas?.length || 8;
        const hasSecaoInRange =
          searchedSecaoNum !== null &&
          searchedSecaoNum >= startSec &&
          searchedSecaoNum < startSec + countSec;

        const textMatch =
          setor.nome_local.toLowerCase().includes(q) ||
          setor.endereco.toLowerCase().includes(q) ||
          setor.bairro.toLowerCase().includes(q) ||
          setor.cidade.toLowerCase().includes(q) ||
          `zona ${setor.zona_eleitoral}`.includes(q) ||
          setor.codigo_local_tse.toLowerCase().includes(q);

        if (!textMatch && !hasSecaoInRange) return null;

        return {
          setor,
          matchedSecao: hasSecaoInRange ? searchedSecaoNum! : undefined,
        };
      })
      .filter(Boolean)
      .slice(0, 6) as { setor: SetorVotacao; matchedSecao?: number }[];

    return {
      municipios: matchedMunicipios,
      setoresMatch: matchedSetores,
    };
  }, [query, setores]);

  const totalMatches =
    searchResults.municipios.length + searchResults.setoresMatch.length;

  return (
    <div className="w-[330px] max-w-[calc(100vw-24px)] bg-[#0B111E]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-3 text-slate-100 space-y-3">
      {/* 1. Search Input + Compact Explorer Trigger */}
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar município, escola ou seção..."
            className="w-full bg-slate-900/90 border border-white/10 focus:border-rose-500/60 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Live Search Dropdown */}
        {query.trim().length > 0 && isFocused && (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-slate-950 divide-y divide-white/5 shadow-xl">
            {totalMatches === 0 ? (
              <div className="px-3 py-2.5 text-center text-xs text-slate-400">
                Nenhum resultado para &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <>
                {searchResults.municipios.length > 0 && (
                  <div>
                    <div className="px-3 py-1 bg-slate-900 text-[10px] font-mono text-slate-400">
                      Municípios ({searchResults.municipios.length})
                    </div>
                    {searchResults.municipios.map((mun) => {
                      const effDom = getEffectiveDominantFactor(mun, showFlavioGrew);
                      const dom = FACTOR_META[effDom];
                      return (
                        <button
                          key={`mun-${mun.ibge}`}
                          onClick={() => {
                            const munSetores = getOrGenerateMunicipioSetores(mun, setores);
                            onSelectMunicipio(mun, munSetores);
                            setIsFocused(false);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                              <span>
                                {mun.nome} / {mun.uf}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {mun.locais_count} locais · {mun.secoes_count} seções
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className="text-[10px] font-medium whitespace-nowrap"
                              style={{ color: dom.color }}
                            >
                              {dom.shortLabel}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {searchResults.setoresMatch.length > 0 && (
                  <div>
                    <div className="px-3 py-1 bg-slate-900 text-[10px] font-mono text-slate-400">
                      Locais de Votação ({searchResults.setoresMatch.length})
                    </div>
                    {searchResults.setoresMatch.map(({ setor, matchedSecao }) => {
                      const effDom = getEffectiveDominantFactor(setor, showFlavioGrew);
                      const dom = FACTOR_META[effDom];
                      return (
                        <button
                          key={setor.id}
                          onClick={() => {
                            onSelectSetor(setor, matchedSecao);
                            setIsFocused(false);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">
                              {setor.nome_local}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {setor.bairro} · {setor.cidade}/{setor.uf}
                            </div>
                          </div>
                          <span
                            className="text-[10px] font-medium shrink-0"
                            style={{ color: dom.color }}
                          >
                            {dom.shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Minimal Quick Bar: Visão Brasil + Dropdown for Capitals/States */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => onSelectCity(null)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeCity === 'ALL'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              Brasil Inteiro
            </button>
            {cidades.slice(0, 2).map((city) => (
              <button
                key={city.id}
                onClick={() => onSelectCity(city)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeCity === city.label
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800/80 text-slate-300 hover:text-white'
                }`}
              >
                {city.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowExplorer((v) => !v)}
            className="px-2 py-1 rounded text-[11px] text-slate-300 hover:text-white bg-slate-800/70 border border-white/8 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>27 UFs</span>
            {showExplorer ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Collapsible UF & Municipality Selector */}
        {showExplorer && (
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedUf('TODAS')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer ${
                  selectedUf === 'TODAS'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Capitais
              </button>
              {ALL_UFS.map((uf) => (
                <button
                  key={uf}
                  onClick={() => setSelectedUf(uf)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer ${
                    selectedUf === uf
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {uf}
                </button>
              ))}
            </div>

            <div className="max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/90 divide-y divide-white/5">
              {ufMunicipios.slice(0, 100).map((mun) => (
                <button
                  key={mun.ibge}
                  onClick={() => {
                    const munSetores = getOrGenerateMunicipioSetores(mun, setores);
                    onSelectMunicipio(mun, munSetores);
                    setShowExplorer(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-slate-800/80 flex items-center justify-between gap-2 text-xs cursor-pointer"
                >
                  <span className="font-medium text-white truncate">
                    {mun.nome}/{mun.uf}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {mun.locais_count} locais
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Clean 2x2 Layer Switcher */}
      <div className="pt-2 border-t border-white/10 space-y-2">
        <div className="text-[11px] font-medium text-slate-400">
          Visualizar no mapa:
        </div>
        <div className="grid grid-cols-2 gap-1 bg-slate-900/90 p-1 rounded-lg border border-white/5">
          {LAYER_OPTIONS.map((tab) => {
            const isActive = activeLayer === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChangeLayer(tab.id)}
                className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors text-center truncate cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white border border-white/15 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 3. Compact Legend */}
        {activeLayer === 'dominant' && (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-300 pt-0.5">
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F43F5E] shrink-0" />
              Transferência 22→13
            </span>
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] shrink-0" />
              Redução Abstenção
            </span>
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#A855F7] shrink-0" />
              Realinhamento 3ª Via
            </span>
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981] shrink-0" />
              Reversão Brancos/Nulos
            </span>
          </div>
        )}

        {activeLayer === 'flavio_loss' && (
          <div className="flex items-center gap-2 text-[10px] font-mono pt-0.5">
            <span className="text-slate-400">Baixa</span>
            <div className="flex-1 grid grid-cols-5 gap-0.5 h-2 rounded overflow-hidden">
              <div className="bg-[#334155]" />
              <div className="bg-[#FDA4AF]" />
              <div className="bg-[#FB7185]" />
              <div className="bg-[#F43F5E]" />
              <div className="bg-[#E11D48]" />
            </div>
            <span className="text-rose-400">Alta Transf. 22→13</span>
          </div>
        )}

        {activeLayer === 'abstention' && (
          <div className="flex items-center gap-2 text-[10px] font-mono pt-0.5">
            <span className="text-slate-400">Estável</span>
            <div className="flex-1 grid grid-cols-5 gap-0.5 h-2 rounded overflow-hidden">
              <div className="bg-[#334155]" />
              <div className="bg-[#FDE68A]" />
              <div className="bg-[#FBBF24]" />
              <div className="bg-[#F59E0B]" />
              <div className="bg-[#D97706]" />
            </div>
            <span className="text-amber-400">-35% Abstenção</span>
          </div>
        )}

        {activeLayer === 'third_way' && (
          <div className="flex items-center gap-2 text-[10px] font-mono pt-0.5">
            <span className="text-slate-400">Menor</span>
            <div className="flex-1 grid grid-cols-5 gap-0.5 h-2 rounded overflow-hidden">
              <div className="bg-[#334155]" />
              <div className="bg-[#D8B4FE]" />
              <div className="bg-[#C084FC]" />
              <div className="bg-[#A855F7]" />
              <div className="bg-[#9333EA]" />
            </div>
            <span className="text-purple-400">&gt;55% 3ª Via</span>
          </div>
        )}

        {/* 4. Optional Clean Toggle for Expansão 22 (OFF by default, turns ON/OFF cleanly) */}
        <div className="pt-1.5 border-t border-white/8 flex items-center justify-between">
          <label
            htmlFor="toggle-expansao-22"
            className="text-[11px] text-slate-300 flex items-center gap-1.5 cursor-pointer select-none"
          >
            <span
              className={`w-2.5 h-2.5 rounded-xs transition-colors ${
                showFlavioGrew ? 'bg-[#0EA5E9]' : 'bg-slate-700'
              }`}
            />
            <span>Destacar Expansão 22 (Δ13 ≤ 0)</span>
          </label>
          <button
            id="toggle-expansao-22"
            type="button"
            role="switch"
            aria-checked={showFlavioGrew}
            onClick={onToggleShowFlavioGrew}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
              showFlavioGrew
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {showFlavioGrew ? 'ATIVO' : 'OCULTO'}
          </button>
        </div>
      </div>
    </div>
  );
};
