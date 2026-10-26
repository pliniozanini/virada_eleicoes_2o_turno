import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Share2,
  Download,
  Check,
  ArrowUpDown,
  Building2,
  Search,
  TrendingUp,
} from 'lucide-react';
import { SetorVotacao } from '../types/electoral';
import {
  FACTOR_META,
  INCOME_BRACKET_LABELS,
  getSecoesForSetor,
} from '../utils/heuristicEngine';
import {
  formatWhatsAppSummary,
  renderSocialCardDataUrl,
} from '../utils/shareCardGenerator';

interface XRaySideDrawerProps {
  setor: SetorVotacao | null;
  highlightedSecao?: number | null;
  onClose: () => void;
}

type SortField =
  | 'secao_numero'
  | 'delta_lula'
  | 'delta_flavio'
  | 'pool_abstention_drop'
  | 'pool_third_way';

export const XRaySideDrawer: React.FC<XRaySideDrawerProps> = ({
  setor,
  highlightedSecao,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'resumo' | 'urnas'>('resumo');
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [cardPreviewUrl, setCardPreviewUrl] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('secao_numero');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [secaoFilter, setSecaoFilter] = useState<string>('');

  useEffect(() => {
    if (highlightedSecao) {
      setActiveTab('urnas');
    } else {
      setActiveTab('resumo');
    }
  }, [setor?.id, highlightedSecao]);

  const allSecoes = useMemo(
    () => (setor ? getSecoesForSetor(setor) : []),
    [setor]
  );

  const sortedSecoes = useMemo(() => {
    if (!setor) return [];
    const filtered = allSecoes.filter((s) =>
      secaoFilter.trim()
        ? String(s.secao_numero).includes(secaoFilter.trim())
        : true
    );
    return [...filtered].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [setor, allSecoes, sortField, sortAsc, secaoFilter]);

  if (!setor) return null;

  const domMeta = FACTOR_META[setor.dominant_factor];
  const incomeMeta = INCOME_BRACKET_LABELS[setor.faixa_renda_ibge];

  const handleCopyWhatsApp = async () => {
    const text = formatWhatsAppSummary(setor);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhatsapp(true);
      setTimeout(() => setCopiedWhatsapp(false), 2600);
    } catch {
      setCopiedWhatsapp(true);
      setTimeout(() => setCopiedWhatsapp(false), 2600);
    }
  };

  const handleGenerateCard = () => {
    const url = renderSocialCardDataUrl(setor);
    setCardPreviewUrl(url);
  };

  const handleDownloadCard = () => {
    if (!cardPreviewUrl) return;
    const link = document.createElement('a');
    link.href = cardPreviewUrl;
    link.download = `raio-x-${setor.id}-virada2026.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'secao_numero');
    }
  };

  const originPools = [
    {
      key: 'flavio_loss' as const,
      label: 'Transferência Direta (22 → 13)',
      votes: setor.attr_flavio_loss,
      pct: setor.pct_flavio_loss,
      color: '#F43F5E',
    },
    {
      key: 'abstention_drop' as const,
      label: 'Comparecimento Adicional (Redução de Abstenção)',
      votes: setor.attr_abstention_drop,
      pct: setor.pct_abstention_drop,
      color: '#F59E0B',
    },
    {
      key: 'third_way' as const,
      label: 'Realinhamento da 3ª Via (1º Turno)',
      votes: setor.attr_third_way,
      pct: setor.pct_third_way,
      color: '#A855F7',
    },
    {
      key: 'blank_null_drop' as const,
      label: 'Reversão de Brancos e Nulos',
      votes: setor.attr_blank_null_drop,
      pct: setor.pct_blank_null_drop,
      color: '#10B981',
    },
  ];

  return (
    <>
      <aside className="absolute top-3 right-3 bottom-3 w-[410px] max-w-[calc(100vw-24px)] z-30 bg-[#0F172A]/96 backdrop-blur-xl border border-white/12 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Drawer Header */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-start justify-between gap-2 bg-slate-900/60">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-400">
              <span>Zona {setor.zona_eleitoral}</span>
              <span aria-hidden="true">·</span>
              <span>{setor.bairro}</span>
              <span aria-hidden="true">·</span>
              <span>
                {setor.cidade}/{setor.uf}
              </span>
              <span aria-hidden="true">·</span>
              <span>Área {setor.area_km2} km²</span>
            </div>

            <h2 className="text-base font-bold text-white mt-0.5 leading-snug">
              {setor.nome_local}
            </h2>

            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {setor.endereco} · {incomeMeta?.label} ({setor.renda_media_mensal_sm} SM)
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Fechar painel Raio-X"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2-Tab Switcher Inside Drawer */}
        <div className="px-4 pt-2.5 pb-2 border-b border-white/10 bg-slate-900/30 flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('resumo')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'resumo'
                ? 'bg-rose-500 text-white'
                : 'bg-slate-800/70 text-slate-400 hover:text-white'
            }`}
          >
             Balanço & Vetores
          </button>
          <button
            onClick={() => setActiveTab('urnas')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'urnas'
                ? 'bg-rose-500 text-white'
                : 'bg-slate-800/70 text-slate-400 hover:text-white'
            }`}
          >
            Urnas / Salas ({allSecoes.length})
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'resumo' ? (
            <>
              {/* Special Callout Banner when Candidate 22 expanded and Δ13 <= 0 */}
              {setor.flavio_grew_2t && (
                <div className="p-3 rounded-xl bg-sky-950/60 border border-sky-400/40 space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-sky-400" />
                      Expansão da Candidatura 22 · Δ13 ≤ 0
                    </span>
                    <span className="font-mono">
                      +{setor.flavio_gain_2t} votos (Cand. 22)
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-100/85 leading-relaxed">
                    Neste setor, a candidatura 13 não registrou acréscimo líquido ({setor.delta_lula} votos no 2ºT) e houve expansão da candidatura 22 (+{setor.flavio_gain_2t} votos). Portanto, os vetores de <strong>Transferência 22 → 13</strong>, <strong>Redução de Abstenção</strong> e <strong>Realinhamento da 3ª Via (→ 13)</strong> <strong>não se aplicam</strong> neste local.
                  </p>
                </div>
              )}

              {/* 1. Scorecard */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-900/90 border border-rose-500/30">
                  <div className="flex items-center justify-between text-[11px] text-rose-300 font-medium">
                    <span>Candidatura 13 (Lula)</span>
                    <span
                      className={`font-mono font-semibold ${
                        setor.delta_lula > 0 ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {setor.delta_lula > 0
                        ? `+${setor.delta_lula}`
                        : `${setor.delta_lula} (Δ13 ≤ 0)`}
                    </span>
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                    {setor.lula_2t.toLocaleString('pt-BR')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">
                    1ºT: {setor.lula_1t.toLocaleString('pt-BR')} votos
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl bg-slate-900/90 border ${
                    setor.flavio_grew_2t
                      ? 'border-sky-400/45 bg-sky-950/25'
                      : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-sky-300 font-medium">
                    <span>Candidatura 22 (Flávio)</span>
                    <span
                      className={`font-mono font-semibold ${
                        setor.delta_flavio >= 0 ? 'text-sky-400' : 'text-rose-400'
                      }`}
                    >
                      {setor.delta_flavio >= 0
                        ? `+${setor.delta_flavio} (+Δ22)`
                        : setor.delta_flavio}
                    </span>
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                    {setor.flavio_2t.toLocaleString('pt-BR')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">
                    1ºT: {setor.flavio_1t.toLocaleString('pt-BR')} votos
                  </div>
                </div>
              </div>

              {/* 2. Origin Breakdown Bars OR Not-Applicable Panel when Candidate 22 Expanded */}
              {setor.flavio_grew_2t || setor.delta_lula <= 0 ? (
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-sky-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-sky-300">
                      Vetores de Crescimento de 13 Não Aplicáveis neste Setor
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
                      Δ13: {setor.delta_lula}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {originPools.map((pool) => (
                      <div
                        key={pool.key}
                        className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-950/70 border border-white/5 text-xs"
                      >
                        <span className="text-slate-400 line-through decoration-slate-600">
                          {pool.label}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          Não se aplica (Δ13 ≤ 0)
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-sky-300">
                        Expansão Líquida da Candidatura 22:
                      </span>
                      <span className="font-mono font-bold text-sky-400">
                        +{setor.flavio_gain_2t} votos (+
                        {(
                          (setor.flavio_gain_2t / Math.max(1, setor.flavio_1t)) *
                          100
                        ).toFixed(1)}
                        %)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Realinhamento da 3ª via ({setor.terceira_via_1t} votos no 1ºT) para a candidatura 22 + retração líquida da candidatura 13 ({setor.delta_lula} votos).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/8 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white">
                      Decomposição da Variação Positiva de 13 (+{setor.delta_lula} votos)
                    </h3>
                  </div>

                  <div className="space-y-2.5">
                    {originPools.map((pool) => (
                      <div key={pool.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{pool.label}</span>
                          <span className="font-mono tabular-nums font-semibold text-white">
                            +{pool.votes}{' '}
                            <span className="text-slate-400 font-normal">
                              ({pool.pct}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(3, pool.pct)}%`,
                              backgroundColor: pool.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Neighborhood Comparison */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    Comparativo com o Entorno Territorial
                  </span>
                  <span
                    className="text-xs font-mono font-bold"
                    style={{ color: domMeta.color }}
                  >
                    {setor.flavio_grew_2t
                      ? 'Vetores Δ13 N/A (+22)'
                      : `${setor.comparativo_vizinhanca.destaque_ratio}x média local`}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {setor.comparativo_vizinhanca.resumo_comparativo}
                </p>
              </div>
            </>
          ) : (
            /* TAB 2: INTERNAL SECTIONS TABLE (URNAS / SALAS) */
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300">
                  {allSecoes.length} seções eleitorais neste edifício
                </span>
                <div className="relative w-32">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={secaoFilter}
                    onChange={(e) => setSecaoFilter(e.target.value)}
                    placeholder="Nº seção..."
                    className="w-full bg-slate-900 border border-white/15 rounded-md pl-7 pr-2 py-1 text-[11px] font-mono text-white placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950/60">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-900/90 text-[10px] font-mono text-slate-400">
                      <th className="py-2 px-2.5">
                        <button
                          onClick={() => toggleSort('secao_numero')}
                          className="flex items-center gap-1 hover:text-white"
                        >
                          Urna <ArrowUpDown className="w-2.5 h-2.5" />
                        </button>
                      </th>
                      <th className="py-2 px-2 text-right">
                        <button
                          onClick={() => toggleSort('delta_lula')}
                          className="inline-flex items-center gap-1 text-emerald-400"
                        >
                          ΔLula <ArrowUpDown className="w-2.5 h-2.5" />
                        </button>
                      </th>
                      <th className="py-2 px-2 text-right">
                        <button
                          onClick={() => toggleSort('delta_flavio')}
                          className="inline-flex items-center gap-1 text-sky-400"
                        >
                          ΔFlávio <ArrowUpDown className="w-2.5 h-2.5" />
                        </button>
                      </th>
                      <th className="py-2 px-2 text-right">
                        <button
                          onClick={() => toggleSort('pool_abstention_drop')}
                          className="inline-flex items-center gap-1 text-amber-400"
                        >
                          -Abst. <ArrowUpDown className="w-2.5 h-2.5" />
                        </button>
                      </th>
                      <th className="py-2 px-2.5 text-right">
                        <button
                          onClick={() => toggleSort('pool_third_way')}
                          className="inline-flex items-center gap-1 text-purple-400"
                        >
                          3ªVia <ArrowUpDown className="w-2.5 h-2.5" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs font-mono tabular-nums">
                    {sortedSecoes.map((sec) => {
                      const isHighlighted = highlightedSecao === sec.secao_numero;
                      const isNoLulaGain = sec.delta_lula <= 0 || sec.delta_flavio > 0;
                      return (
                        <tr
                          key={sec.secao_numero}
                          className={
                            isHighlighted
                              ? 'bg-amber-500/20 text-white'
                              : 'hover:bg-white/5 text-slate-200'
                          }
                        >
                          <td className="py-2 px-2.5 font-semibold">
                            Seção {sec.secao_numero}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-semibold ${
                              sec.delta_lula > 0 ? 'text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            {sec.delta_lula > 0 ? `+${sec.delta_lula}` : sec.delta_lula}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-semibold ${
                              sec.delta_flavio > 0 ? 'text-sky-400' : 'text-rose-300'
                            }`}
                          >
                            {sec.delta_flavio > 0
                              ? `+${sec.delta_flavio}`
                              : sec.delta_flavio}
                          </td>
                          <td className="py-2 px-2 text-right text-amber-300">
                            {isNoLulaGain ? (
                              <span className="text-slate-500">N/A</span>
                            ) : (
                              `-${sec.pool_abstention_drop}`
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-right text-purple-300">
                            {isNoLulaGain ? (
                              <span className="text-slate-500">N/A</span>
                            ) : (
                              sec.pool_third_way
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer: Share Actions */}
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/90 flex items-center gap-2">
          <button
            onClick={handleCopyWhatsApp}
            className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedWhatsapp ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copiado!
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                Copiar p/ WhatsApp
              </>
            )}
          </button>

          <button
            onClick={handleGenerateCard}
            className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-rose-400" />
            Card PNG
          </button>
        </div>
      </aside>

      {/* Social Card Preview & Download Modal */}
      {cardPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/15 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Card Visual · {setor.nome_local}
              </h3>
              <button
                onClick={() => setCardPreviewUrl(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col items-center">
              <img
                src={cardPreviewUrl}
                alt={`Card Raio-X ${setor.nome_local}`}
                referrerPolicy="no-referrer"
                className="w-full max-h-[60vh] object-contain rounded-lg border border-white/10"
              />
              <div className="mt-4 flex items-center gap-3 w-full">
                <button
                  onClick={handleDownloadCard}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Baixar PNG (1080×1350)
                </button>
                <button
                  onClick={() => setCardPreviewUrl(null)}
                  className="py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
