import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronUp,
  Landmark,
  Wallet,
  X,
} from 'lucide-react';
import { IncomeBracketKey, SetorVotacao } from '../types/electoral';
import { INCOME_BRACKET_LABELS } from '../utils/heuristicEngine';

interface BottomAnalysisDockProps {
  setores: SetorVotacao[];
  activeCity: string;
  isDrawerOpen: boolean;
  resumoNacional: {
    lula_1t_nacional: number;
    lula_2t_nacional: number;
    flavio_1t_nacional: number;
    flavio_2t_nacional: number;
    delta_lula_nacional: number;
    attr_flavio_loss_nacional: number;
    attr_abstention_drop_nacional: number;
    attr_third_way_nacional: number;
    attr_blank_null_drop_nacional: number;
  };
}

type DockTab = 'renda_ibge' | 'efeito_governador' | 'cascata_waterfall';

export const BottomAnalysisDock: React.FC<BottomAnalysisDockProps> = ({
  setores,
  activeCity,
  resumoNacional,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>('renda_ibge');

  const scopedSetores = useMemo(() => {
    if (activeCity === 'ALL') return setores;
    const filtered = setores.filter((s) => s.cidade === activeCity);
    return filtered.length > 0 ? filtered : setores;
  }, [setores, activeCity]);

  const incomeStats = useMemo(() => {
    const brackets: IncomeBracketKey[] = [
      'ate_2sm',
      'de_2_a_5sm',
      'de_5_a_10sm',
      'acima_10sm',
    ];

    return brackets.map((key) => {
      const group = scopedSetores.filter((s) => s.faixa_renda_ibge === key);
      const totalDelta = Math.max(
        1,
        group.reduce((acc, s) => acc + s.delta_lula, 0)
      );
      const flavio = group.reduce((acc, s) => acc + s.attr_flavio_loss, 0);
      const abst = group.reduce((acc, s) => acc + s.attr_abstention_drop, 0);
      const third = group.reduce((acc, s) => acc + s.attr_third_way, 0);
      const bn = group.reduce((acc, s) => acc + s.attr_blank_null_drop, 0);

      return {
        key,
        label: INCOME_BRACKET_LABELS[key].label,
        range: INCOME_BRACKET_LABELS[key].range,
        count: group.length,
        totalDelta,
        pctFlavio: Number(((flavio / totalDelta) * 100).toFixed(1)),
        pctAbst: Number(((abst / totalDelta) * 100).toFixed(1)),
        pctThird: Number(((third / totalDelta) * 100).toFixed(1)),
        pctBn: Number(((bn / totalDelta) * 100).toFixed(1)),
      };
    });
  }, [scopedSetores]);

  const governorStats = useMemo(() => {
    const computeGroup = (has2t: boolean, title: string, desc: string) => {
      const group = setores.filter((s) => s.teve_2t_governador === has2t);
      const totalDelta = Math.max(
        1,
        group.reduce((acc, s) => acc + s.delta_lula, 0)
      );
      const flavio = group.reduce((acc, s) => acc + s.attr_flavio_loss, 0);
      const abst = group.reduce((acc, s) => acc + s.attr_abstention_drop, 0);
      const third = group.reduce((acc, s) => acc + s.attr_third_way, 0);
      const bn = group.reduce((acc, s) => acc + s.attr_blank_null_drop, 0);
      const avgDeltaPerSchool = Math.round(totalDelta / Math.max(1, group.length));

      return {
        title,
        desc,
        schoolsCount: group.length,
        avgDeltaPerSchool,
        pctFlavio: Number(((flavio / totalDelta) * 100).toFixed(1)),
        pctAbst: Number(((abst / totalDelta) * 100).toFixed(1)),
        pctThird: Number(((third / totalDelta) * 100).toFixed(1)),
        pctBn: Number(((bn / totalDelta) * 100).toFixed(1)),
      };
    };

    return [
      computeGroup(
        true,
        'Estados COM 2º Turno Estadual (SP, RJ, MG, PE, BA, RS, AM)',
        'Campanhas estaduais ativas elevaram o comparecimento e reduziram a abstenção.'
      ),
      computeGroup(
        false,
        'Estados com Governador Definido no 1º Turno (PR, DF, CE, PA, GO)',
        'Sem disputa estadual no 2ºT, a variação decorreu sobretudo do realinhamento da 3ª via e transferência direta.'
      ),
    ];
  }, [setores]);

  if (!isExpanded) {
    return (
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={() => setIsExpanded(true)}
          className="px-4 py-2 rounded-full bg-[#0F172A]/95 hover:bg-slate-800 backdrop-blur-md border border-white/15 shadow-xl text-xs font-semibold text-slate-100 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap"
        >
          <BarChart3 className="w-3.5 h-3.5 text-rose-400" />
          <span>Análise Socioeconômica: Renda IBGE · Efeito Governador · Decomposição 2T</span>
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 z-40 max-w-5xl mx-auto bg-[#0F172A]/98 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/70">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('renda_ibge')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'renda_ibge'
                ? 'bg-rose-500 text-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            Faixas de Renda (Censo IBGE)
          </button>

          <button
            onClick={() => setActiveTab('efeito_governador')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'efeito_governador'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            Contexto Eleitoral Estadual
          </button>

          <button
            onClick={() => setActiveTab('cascata_waterfall')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'cascata_waterfall'
                ? 'bg-purple-500 text-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Decomposição Agregada Nacional (1ºT → 2ºT)
          </button>
        </div>

        <button
          onClick={() => setIsExpanded(false)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          aria-label="Fechar painel socioeconômico"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 max-h-[280px] overflow-y-auto">
        {activeTab === 'renda_ibge' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {incomeStats.map((item) => (
              <div
                key={item.key}
                className="p-3 rounded-xl bg-slate-900/90 border border-white/10 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">
                    {item.label}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400">
                    +{item.totalDelta.toLocaleString('pt-BR')} v.
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">{item.range}</div>

                <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-800">
                  <div
                    style={{ width: `${item.pctFlavio}%`, backgroundColor: '#F43F5E' }}
                  />
                  <div
                    style={{ width: `${item.pctAbst}%`, backgroundColor: '#F59E0B' }}
                  />
                  <div
                    style={{ width: `${item.pctThird}%`, backgroundColor: '#A855F7' }}
                  />
                  <div
                    style={{ width: `${item.pctBn}%`, backgroundColor: '#10B981' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-1 pt-1 text-[11px] font-mono">
                  <span className="text-rose-400">Transf. 22→13: {item.pctFlavio}%</span>
                  <span className="text-amber-400">-Abst.: {item.pctAbst}%</span>
                  <span className="text-purple-400">3ª Via: {item.pctThird}%</span>
                  <span className="text-emerald-400">B/N: {item.pctBn}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'efeito_governador' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {governorStats.map((g, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">{g.title}</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{g.desc}</p>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <div className="text-xs font-bold text-emerald-400">
                      +{g.avgDeltaPerSchool} v./escola
                    </div>
                  </div>
                </div>

                <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-800">
                  <div
                    style={{ width: `${g.pctFlavio}%`, backgroundColor: '#F43F5E' }}
                  />
                  <div
                    style={{ width: `${g.pctAbst}%`, backgroundColor: '#F59E0B' }}
                  />
                  <div
                    style={{ width: `${g.pctThird}%`, backgroundColor: '#A855F7' }}
                  />
                  <div
                    style={{ width: `${g.pctBn}%`, backgroundColor: '#10B981' }}
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px] font-mono">
                  <span className="text-rose-400">Transf. 22→13: {g.pctFlavio}%</span>
                  <span className="text-amber-400">-Abst.: {g.pctAbst}%</span>
                  <span className="text-purple-400">3ª Via: {g.pctThird}%</span>
                  <span className="text-emerald-400">B/N: {g.pctBn}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'cascata_waterfall' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono">
            <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
              <div className="text-[10px] text-slate-400">1. Votação 1º Turno (13)</div>
              <div className="text-base font-bold text-white mt-1">54,82 mi</div>
              <div className="text-[11px] text-slate-400 mt-1">
                {resumoNacional.lula_1t_nacional.toLocaleString('pt-BR')}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-950/35 border border-rose-500/30">
              <div className="text-[10px] text-rose-300">+ Transf. 22 → 13</div>
              <div className="text-base font-bold text-rose-400 mt-1">+1,80 mi</div>
              <div className="text-[11px] text-rose-200/80 mt-1">27,0% de Δ13</div>
            </div>

            <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-500/30">
              <div className="text-[10px] text-amber-300">+ Redução Abstenção</div>
              <div className="text-base font-bold text-amber-400 mt-1">+2,27 mi</div>
              <div className="text-[11px] text-amber-200/80 mt-1">34,0% de Δ13</div>
            </div>

            <div className="p-3 rounded-xl bg-purple-950/35 border border-purple-500/30">
              <div className="text-[10px] text-purple-300">+ Realinhamento 3ª Via</div>
              <div className="text-base font-bold text-purple-400 mt-1">+2,13 mi</div>
              <div className="text-[11px] text-purple-200/80 mt-1">32,0% de Δ13</div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/30">
              <div className="text-[10px] text-emerald-300">+ Reversão B/N</div>
              <div className="text-base font-bold text-emerald-400 mt-1">+0,47 mi</div>
              <div className="text-[11px] text-emerald-200/80 mt-1">7,0% de Δ13</div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/50">
              <div className="text-[10px] text-emerald-300 font-semibold">
                = Votação 2º Turno (13)
              </div>
              <div className="text-base font-bold text-white mt-1">61,49 mi</div>
              <div className="text-[11px] text-emerald-400 mt-1">Total Consolidado</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
