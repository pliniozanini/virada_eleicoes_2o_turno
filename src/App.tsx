/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { PRECOMPUTED_ELECTORAL_DATASET } from './data/precomputedElectoralData';
import {
  CityQuickJump,
  MapLayerId,
  MunicipioEleitoral,
  SetorVotacao,
} from './types/electoral';
import { BRASIL_5570_STATS } from './utils/municipioVoronoiGenerator';
import { InteractiveElectoralMap } from './components/InteractiveElectoralMap';
import { SearchAndCityPanel } from './components/SearchAndCityPanel';
import { XRaySideDrawer } from './components/XRaySideDrawer';
import { BottomAnalysisDock } from './components/BottomAnalysisDock';
import { GuidedTourOverlay } from './components/GuidedTourOverlay';
import { TseDataModal } from './components/TseDataModal';
import { X, Calculator } from 'lucide-react';

export default function App() {
  const [setores, setSetores] = useState<SetorVotacao[]>(
    PRECOMPUTED_ELECTORAL_DATASET.setores
  );
  const [activeLayer, setActiveLayer] = useState<MapLayerId>('dominant');
  const [showFlavioGrew, setShowFlavioGrew] = useState<boolean>(false);
  const [activeCity, setActiveCity] = useState<string>('ALL');
  const [selectedSetor, setSelectedSetor] = useState<SetorVotacao | null>(null);
  const [highlightedSecao, setHighlightedSecao] = useState<number | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{
    center: [number, number];
    zoom: number;
    timestamp: number;
  } | null>({
    center: [-14.235, -51.925],
    zoom: 5,
    timestamp: Date.now(),
  });

  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [tourStepIndex, setTourStepIndex] = useState<number>(0);

  const [isTseModalOpen, setIsTseModalOpen] = useState<boolean>(false);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  const handleSelectSetor = useCallback(
    (setor: SetorVotacao, secaoNum?: number) => {
      setSelectedSetor(setor);
      setHighlightedSecao(secaoNum ?? null);
      setActiveCity(setor.cidade);
      setCameraTarget({
        center: setor.center,
        zoom: 14,
        timestamp: Date.now(),
      });
    },
    []
  );

  const handleSelectMunicipio = useCallback(
    (mun: MunicipioEleitoral, generatedSetores: SetorVotacao[]) => {
      setSetores((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const toAdd = generatedSetores.filter((s) => !existingIds.has(s.id));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });

      setActiveCity(mun.nome);
      setHighlightedSecao(null);
      if (generatedSetores.length > 0) {
        setSelectedSetor(generatedSetores[0]);
      }
      setCameraTarget({
        center: [mun.lat, mun.lng],
        zoom: 13,
        timestamp: Date.now(),
      });
    },
    []
  );

  const handleSelectCity = useCallback((city: CityQuickJump | null) => {
    setSelectedSetor(null);
    if (!city) {
      setActiveCity('ALL');
      setCameraTarget({
        center: [-14.235, -51.925],
        zoom: 5,
        timestamp: Date.now(),
      });
      return;
    }
    setActiveCity(city.label);
    setCameraTarget({
      center: city.center,
      zoom: city.zoom,
      timestamp: Date.now(),
    });
  }, []);

  const handleStartOrStepTour = useCallback(
    (stepIdx: number) => {
      const steps = PRECOMPUTED_ELECTORAL_DATASET.tour_guiado;
      const targetStep = steps[stepIdx];
      if (!targetStep) return;

      setIsTourActive(true);
      setTourStepIndex(stepIdx);
      setActiveLayer(targetStep.layer);
      setShowFlavioGrew(false);
      setActiveCity(targetStep.cidade);

      const foundSetor = setores.find((s) => s.id === targetStep.setorId);
      if (foundSetor) {
        setSelectedSetor(foundSetor);
      }

      setCameraTarget({
        center: targetStep.center,
        zoom: targetStep.zoom,
        timestamp: Date.now(),
      });
    },
    [setores]
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#060911] select-none flex flex-col">
      {/* Top Header with Title & Explanatory Context */}
      <header className="relative z-40 bg-[#080C15]/95 backdrop-blur-md border-b border-white/10 px-5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Title + Question statement */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href="#mapa"
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectCity(null);
                }}
                className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap"
              >
                De onde vieram os votos de Lula?
              </a>
              <span className="hidden sm:inline-block text-[11px] font-mono text-rose-400/90 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                5.570 Municípios · 56.652 Locais · 454 mil Urnas
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed max-w-4xl">
              Este mapa responde como se compôs o crescimento de votos de Lula entre o 1º e o 2º turno em cada município e escola eleitoral do Brasil, estimando o peso de quatro origens: <strong className="text-rose-400 font-medium">transferência direta (22 → 13)</strong>, <strong className="text-amber-400 font-medium">redução da abstenção</strong>, <strong className="text-purple-400 font-medium">realinhamento da 3ª via</strong> e <strong className="text-emerald-400 font-medium">reversão de brancos/nulos</strong>.
            </p>
          </div>

          {/* Right Navigation & Actions */}
          <div className="flex items-center gap-4 shrink-0">
            <nav className="hidden lg:flex items-center gap-4 text-xs font-medium text-slate-300">
              <button
                onClick={() => handleStartOrStepTour(0)}
                className="hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                Tour Guiado
              </button>
              <button
                onClick={() => handleSelectCity(null)}
                className="hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                Visão Brasil
              </button>
              <button
                onClick={() => setIsMethodologyOpen(true)}
                className="hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                Metodologia
              </button>
            </nav>

            <button
              onClick={() => setIsTseModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Base TSE / CSV
            </button>
          </div>
        </div>
      </header>

      {/* Main Full-Screen Interactive Polygon Map */}
      <main className="relative flex-1 w-full overflow-hidden">
        <InteractiveElectoralMap
          setores={setores}
          activeLayer={activeLayer}
          showFlavioGrew={showFlavioGrew}
          selectedSetor={selectedSetor}
          onSelectSetor={(s) => handleSelectSetor(s)}
          onSelectMunicipio={handleSelectMunicipio}
          cameraTarget={cameraTarget}
        />

        {/* Single Unified Left Control Panel (Search + UF/Cities + Layers + Legend) */}
        <div className="absolute top-3 left-3 z-20">
          <SearchAndCityPanel
            setores={setores}
            cidades={PRECOMPUTED_ELECTORAL_DATASET.cidades}
            activeCity={activeCity}
            activeLayer={activeLayer}
            onChangeLayer={setActiveLayer}
            showFlavioGrew={showFlavioGrew}
            onToggleShowFlavioGrew={() => setShowFlavioGrew((v) => !v)}
            onSelectCity={handleSelectCity}
            onSelectSetor={handleSelectSetor}
            onSelectMunicipio={handleSelectMunicipio}
          />
        </div>

        {/* Right Side Drawer: Opens when a school polygon is clicked or searched */}
        <XRaySideDrawer
          setor={selectedSetor}
          highlightedSecao={highlightedSecao}
          onClose={() => setSelectedSetor(null)}
        />
      </main>

      {/* Guided Tour Narrative Overlay */}
      {isTourActive && (
        <GuidedTourOverlay
          steps={PRECOMPUTED_ELECTORAL_DATASET.tour_guiado}
          currentIndex={tourStepIndex}
          onSelectStep={handleStartOrStepTour}
          onClose={() => setIsTourActive(false)}
        />
      )}

      {/* Bottom Compact Pill -> Expandable Cross-Data Analysis */}
      <BottomAnalysisDock
        setores={setores}
        activeCity={activeCity}
        isDrawerOpen={Boolean(selectedSetor)}
        resumoNacional={PRECOMPUTED_ELECTORAL_DATASET.resumo_nacional}
      />

      {/* TSE Consolidated Dataset & Custom CSV/JSON Loader Modal */}
      <TseDataModal
        isOpen={isTseModalOpen}
        onClose={() => setIsTseModalOpen(false)}
        setores={setores}
        onUpdateSetores={(updated) => {
          setSetores(updated);
          if (updated.length > 0) {
            handleSelectSetor(updated[0]);
          }
        }}
        onResetDefault={() => {
          setSetores(PRECOMPUTED_ELECTORAL_DATASET.setores);
          setSelectedSetor(null);
        }}
      />

      {/* Methodology Modal */}
      {isMethodologyOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/15 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl text-slate-100">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/70">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-rose-400" />
                <h2 className="text-sm font-bold text-white">
                  Metodologia · De onde vieram os votos de Lula?
                </h2>
              </div>
              <button
                onClick={() => setIsMethodologyOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-xs text-slate-300 leading-relaxed">
              <p>
                Para responder <strong>de onde vieram os novos votos de Lula no 2º turno</strong>, este aplicativo consolida os boletins de urna de <strong>todos os {BRASIL_5570_STATS.total_municipios.toLocaleString('pt-BR')} municípios brasileiros (IBGE/TSE) nas 27 UFs</strong>, cobrindo <strong>{BRASIL_5570_STATS.total_locais_votacao.toLocaleString('pt-BR')} Locais de Votação (Escolas/Setores Voronoi)</strong> e <strong>{BRASIL_5570_STATS.total_secoes_eleitorais.toLocaleString('pt-BR')} Seções Eleitorais (Urnas)</strong>.
              </p>
              <p>
                <strong>Malha 100% Poligonal Recortada por Terra Firme e Ilhas Costeiras:</strong> Na visão nacional e estadual, são exibidos exclusivamente os polígonos territoriais oficiais do IBGE de cada município brasileiro sobre fundo limpo. Ao aproximar em uma cidade, os polígonos Voronoi de cada local de votação são recortados estritamente contra o contorno terrestre e insular do município (como na Ilha de Santa Catarina e Estreito em Florianópolis), evitando qualquer avanço sobre o mar ou baías.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-white/10 font-mono text-[11px] space-y-1.5 text-slate-200">
                <div className="text-emerald-400 font-semibold">
                  Δ13 = max(0, Votos13_2T − Votos13_1T) | Δ22 = Votos22_2T − Votos22_1T
                </div>
                <div>1. Transferência Direta (22 → 13) = max(0, Votos22_1T − Votos22_2T)</div>
                <div>2. Comparecimento Adicional = max(0, Abstenção_1T − Abstenção_2T)</div>
                <div>3. Reversão de Brancos/Nulos = max(0, BN_1T − BN_2T)</div>
                <div>4. Realinhamento da 3ª Via = Votos nominais de outras candidaturas no 1ºT</div>
                <div className="text-sky-400">
                  * A camada opcional &quot;Destacar Expansão 22 (Δ13 ≤ 0)&quot; fica desativada por padrão e pode ser ligada/desligada no painel lateral para inspecionar os {BRASIL_5570_STATS.total_municipios_flavio_cresceu} municípios onde o candidato 22 ampliou votação sem crescimento líquido de 13.
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setIsMethodologyOpen(false)}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors"
                >
                  Entendi, voltar ao mapa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
