import React, { useState } from 'react';
import {
  Database,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  X,
  Download,
} from 'lucide-react';
import { SetorVotacao } from '../types/electoral';
import { parseCustomTseUpload } from '../utils/heuristicEngine';

interface TseDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  setores: SetorVotacao[];
  onUpdateSetores: (newSetores: SetorVotacao[]) => void;
  onResetDefault: () => void;
}

const SAMPLE_CSV_TEMPLATE = [
  'codigo_local_tse;zona_eleitoral;nome_local;endereco;bairro;cidade;uf;secao_numero;eleitores_aptos;lula_1t;flavio_1t;terceira_via_1t;brancos_nulos_1t;abstencao_1t;lula_2t;flavio_2t;brancos_nulos_2t;abstencao_2t;lat;lng',
  'SP-0001-9901;1;EE Caetano de Campos - Consolação;Praça Roosevelt, 200 - Consolação;Consolação;São Paulo;SP;101;395;152;92;74;16;61;212;74;11;52;-23.5489;-46.6468',
  'SP-0001-9901;1;EE Caetano de Campos - Consolação;Praça Roosevelt, 200 - Consolação;Consolação;São Paulo;SP;102;390;148;95;70;15;62;206;78;10;54;-23.5489;-46.6468',
  'SP-0001-9901;1;EE Caetano de Campos - Consolação;Praça Roosevelt, 200 - Consolação;Consolação;São Paulo;SP;103;398;155;90;76;17;60;218;71;12;51;-23.5489;-46.6468',
].join('\n');

export const TseDataModal: React.FC<TseDataModalProps> = ({
  isOpen,
  onClose,
  setores,
  onUpdateSetores,
  onResetDefault,
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [rawTextInput, setRawTextInput] = useState<string>('');

  if (!isOpen) return null;

  const totalSecoes = setores.reduce((acc, s) => acc + s.secoes_internas.length, 0);
  const totalEleitores = setores.reduce((acc, s) => acc + s.eleitores_aptos, 0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      try {
        const updated = parseCustomTseUpload(content, file.name, setores);
        onUpdateSetores(updated);
        setStatusMessage(
          `Arquivo "${file.name}" processado com sucesso! Total atual: ${updated.length} setores no mapa.`
        );
      } catch {
        setStatusMessage(
          'Formato inválido. Utilize o modelo CSV separado por ponto e vírgula (;) ou JSON estruturado.'
        );
      }
    };
    reader.readAsText(file);
  };

  const handleIngestSampleOrText = () => {
    const content = rawTextInput.trim() || SAMPLE_CSV_TEMPLATE;
    const updated = parseCustomTseUpload(content, 'Lote-TSE-Manual.csv', setores);
    onUpdateSetores(updated);
    setStatusMessage(
      `Lote TSE integrado! O setor "EE Caetano de Campos - Consolação" foi calculado e adicionado ao mapa.`
    );
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_tse_votacao_secao_2026.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-white/15 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl text-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Base Consolidada TSE (100% Pré-Processada) & Importador de Boletins
              </h2>
              <p className="text-xs text-slate-400">
                Navegação instantânea sobre dados pré-calculados offline + ingestão de lotes CSV/JSON
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Pre-computed Status Banner */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Dataset Nacional Consolidado Carregado em Memória (Offline-Ready)
              </div>
              <p className="text-xs text-slate-300">
                Todos os polígonos Voronoi, os 4 pools da heurística de balanço simples e as médias de vizinhança já foram pré-processados para leitura imediata.
              </p>
            </div>
            <div className="flex items-center gap-4 font-mono text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Setores</span>
                <span className="text-white font-bold">{setores.length} escolas</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Urnas</span>
                <span className="text-white font-bold">{totalSecoes} seções</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Eleitorado</span>
                <span className="text-white font-bold">
                  {totalEleitores.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
          </div>

          {/* Upload CSV / JSON Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white">
                Importar Arquivo Adicional do TSE (votacao_secao / detalhe_votacao_secao)
              </h3>
              <button
                onClick={handleDownloadSampleCsv}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Modelo CSV TSE
              </button>
            </div>

            <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-white/15 hover:border-rose-500/50 rounded-xl bg-slate-900/50 cursor-pointer transition-colors">
              <Upload className="w-6 h-6 text-slate-400 mb-2" />
              <span className="text-xs font-medium text-white">
                Clique para selecionar um arquivo .CSV ou .JSON do TSE
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">
                Recalcula automaticamente ΔLula, Sangria Flávio, Queda de Abstenção e 3ª Via por urna
              </span>
              <input
                type="file"
                accept=".csv,.json,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Direct Paste or 1-Click Test Batch */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                Ou cole linhas CSV / teste um lote extra (Ex: EE Caetano de Campos - SP):
              </span>
            </div>
            <textarea
              rows={4}
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              placeholder={SAMPLE_CSV_TEMPLATE}
              className="w-full rounded-lg bg-slate-950 border border-white/15 p-3 text-[11px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50"
            />
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                onClick={handleIngestSampleOrText}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors"
              >
                Processar e Integrar Lote TSE no Mapa
              </button>
              <button
                onClick={() => {
                  onResetDefault();
                  setStatusMessage('Base consolidada original (50 setores) restaurada.');
                }}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
              >
                Restaurar Base Original
              </button>
            </div>
          </div>

          {statusMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300">
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
