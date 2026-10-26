import React, { useMemo, useState } from 'react';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { CityQuickJump, SetorVotacao } from '../types/electoral';
import { FACTOR_META } from '../utils/heuristicEngine';

interface SearchAndCityPanelProps {
  setores: SetorVotacao[];
  cidades: CityQuickJump[];
  activeCity: string;
  onSelectCity: (city: CityQuickJump | null) => void;
  onSelectSetor: (setor: SetorVotacao, highlightSecao?: number) => void;
}

export const SearchAndCityPanel: React.FC<SearchAndCityPanelProps> = ({
  setores,
  cidades,
  activeCity,
  onSelectCity,
  onSelectSetor,
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);

  const visibleCities = showAllCities ? cidades : cidades.slice(0, 6);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const secaoMatch = q.match(/(?:se[cç][aã]o\s*)?(\d{3})\b/);
    const searchedSecaoNum = secaoMatch ? parseInt(secaoMatch[1], 10) : null;

    return setores
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
          setor.uf.toLowerCase() === q ||
          `${setor.cidade.toLowerCase()}/${setor.uf.toLowerCase()}`.includes(q) ||
          `zona ${setor.zona_eleitoral}`.includes(q) ||
          setor.codigo_local_tse.toLowerCase().includes(q);

        if (!textMatch && !hasSecaoInRange) return null;

        return {
          setor,
          matchedSecao: hasSecaoInRange ? searchedSecaoNum! : undefined,
        };
      })
      .filter(Boolean)
      .slice(0, 8) as { setor: SetorVotacao; matchedSecao?: number }[];
  }, [query, setores]);

  return (
    <div className="w-[340px] max-w-[calc(100vw-24px)] bg-[#0F172A]/92 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3 text-slate-100">
      {/* Compact Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onFocus={() => setIsFocused(true)}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar escola, cidade, UF, bairro ou seção (ex: 104)..."
          className="w-full bg-slate-900/90 border border-white/12 focus:border-rose-500/60 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none transition-colors"
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

      {/* Live Search Dropdown Results */}
      {query.trim().length > 0 && isFocused && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/95 divide-y divide-white/5">
          {searchResults.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-slate-400">
              Nenhum local encontrado para &ldquo;{query}&rdquo;.
            </div>
          ) : (
            searchResults.map(({ setor, matchedSecao }) => {
              const dom = FACTOR_META[setor.dominant_factor];
              return (
                <button
                  key={setor.id}
                  onClick={() => {
                    onSelectSetor(setor, matchedSecao);
                    setIsFocused(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800/80 transition-colors flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {setor.nome_local}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {setor.bairro} · {setor.cidade}/{setor.uf}
                    </div>
                    {matchedSecao && (
                      <div className="text-[10px] font-mono text-amber-400 mt-0.5">
                        Seção {matchedSecao} localizada aqui
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-semibold text-emerald-400">
                      +{setor.delta_lula}
                    </div>
                    <div
                      className="text-[10px] font-medium whitespace-nowrap"
                      style={{ color: dom.color }}
                    >
                      {dom.shortLabel}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Compact City Selector Row (All 27 UFs & 43 Municipalities) */}
      <div
        className={`mt-2.5 flex flex-wrap items-center gap-1 ${
          showAllCities ? 'max-h-48 overflow-y-auto pr-1' : ''
        }`}
      >
        <button
          onClick={() => onSelectCity(null)}
          className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeCity === 'ALL'
              ? 'bg-rose-500 text-white'
              : 'bg-slate-800/80 text-slate-300 hover:text-white'
          }`}
        >
          Brasil (27 UFs)
        </button>

        {visibleCities.map((city) => {
          const isSelected = activeCity === city.label;
          return (
            <button
              key={city.id}
              onClick={() => onSelectCity(city)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {city.label}/{city.uf}
            </button>
          );
        })}

        <button
          onClick={() => setShowAllCities((v) => !v)}
          className="px-2 py-1 rounded-md text-[11px] text-rose-300 hover:text-white bg-slate-900/90 border border-white/10 flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {showAllCities ? (
            <>
              Recolher <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              +{cidades.length - 6} cidades (27 UFs) <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
