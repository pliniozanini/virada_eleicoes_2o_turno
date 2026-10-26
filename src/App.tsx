/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { PRECOMPUTED_ELECTORAL_DATASET } from './data/precomputedElectoralData';
import { CityQuickJump, MapLayerId, SetorVotacao } from './types/electoral';
import { InteractiveElectoralMap } from './components/InteractiveElectoralMap';
import { SearchAndCityPanel } from './components/SearchAndCityPanel';
import { LayerSwitcherPanel } from './components/LayerSwitcherPanel';
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
  const [onlyFlavioGrew, setOnlyFlavioGrew] = useState<boolean>(false);
  const [activeCity, setActiveCity] = useState<string>('São Paulo');
  const [selectedSetor, setSelectedSetor] = useState<SetorVotacao | null>(null);
  const [highlightedSecao, setHighlightedSecao] = useState<number | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{
    center: [number, number];
    zoom: number;
    timestamp: number;
  } | null>({
    center: [-23.562, -46.645],
    zoom: 12,
    timestamp: Date.now(),
  });

  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [tourStepIndex, setTourStepIndex] = useState<number>(0);

  const [isTseModalOpen, setIsTseModalOpen] = useState<boolean>(false);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  const flavioGrewCount = useMemo(
    () => setores.filter((s) => s.flavio_grew_2t).length,
    [setores]
  );

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

  const handleSelectCity = useCallback((city: CityQuickJump | null) => {
    setSelectedSetor(null);
    if (!city) {
      setActiveCity('ALL');
      setCameraTarget({
        center: [-15.78, -47.92],
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
      setOnlyFlavioGrew(false);
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
    <div className="relative w-screen h-screen overflow-hidden bg-[#0B0F17] select-none">
      {/* 3-Zone Top Bar Contract */}
      <header className="fixed top-0 left-0 right-0 h-12 z-40 bg-[#090D16]/95 backdrop-blur-md border-b border-white/10 px-5 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#mapa"
          onClick={(e) => {
            e.preventDefault();
            handleSelectCity(PRECOMPUTED_ELECTORAL_DATASET.cidades[0]);
          }}
          className="text-base font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          Anatomia da Virada 2026
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <button
            onClick={() => handleStartOrStepTour(0)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Tour Guiado
          </button>
          <button
            onClick={() => handleSelectCity(null)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Visão Nacional ({setores.length} Setores)
          </button>
          <button
            onClick={() => {
              const flavioGainSample = setores.find((s) => s.flavio_grew_2t);
              if (flavioGainSample) handleSelectSetor(flavioGainSample);
            }}
            className="hover:text-sky-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer text-sky-400"
          >
            Casos Avanço Flávio (+22)
          </button>
          <button
            onClick={() => setIsMethodologyOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Metodologia
          </button>
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setIsTseModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Base TSE (3.873 Urnas)
          </button>
        </div>
      </header>

      {/* Main Full-Screen Interactive Dark Map */}
      <main className="w-full h-full pt-12">
        <InteractiveElectoralMap
          setores={setores}
          activeLayer={activeLayer}
          onlyFlavioGrew={onlyFlavioGrew}
          selectedSetor={selectedSetor}
          onSelectSetor={(s) => handleSelectSetor(s)}
          cameraTarget={cameraTarget}
        />
      </main>

      {/* Top-Left Compact Search & City Selector */}
      <div className="fixed top-15 left-3 z-20">
        <SearchAndCityPanel
          setores={setores}
          cidades={PRECOMPUTED_ELECTORAL_DATASET.cidades}
          activeCity={activeCity}
          onSelectCity={handleSelectCity}
          onSelectSetor={handleSelectSetor}
        />
      </div>

      {/* Top-Right Compact Layer Switcher & Single-Line Legend */}
      <div
        className={`fixed top-15 z-20 transition-all duration-200 hidden sm:block ${
          selectedSetor ? 'right-[440px]' : 'right-3'
        }`}
      >
        <LayerSwitcherPanel
          activeLayer={activeLayer}
          onChangeLayer={(layer) => setActiveLayer(layer)}
          onlyFlavioGrew={onlyFlavioGrew}
          onToggleOnlyFlavioGrew={() => setOnlyFlavioGrew((v) => !v)}
          flavioGrewCount={flavioGrewCount}
        />
      </div>

      {/* Guided Tour Narrative Overlay */}
      {isTourActive && (
        <GuidedTourOverlay
          steps={PRECOMPUTED_ELECTORAL_DATASET.tour_guiado}
          currentIndex={tourStepIndex}
          onSelectStep={handleStartOrStepTour}
          onClose={() => setIsTourActive(false)}
        />
      )}

      {/* Right Side Drawer: Opens when a school polygon is clicked or searched */}
      <XRaySideDrawer
        setor={selectedSetor}
        highlightedSecao={highlightedSecao}
        onClose={() => setSelectedSetor(null)}
      />

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
                  Metodologia · Malha Voronoi e Heurística de Balanço por Seção
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
                A base nacional consolidada abrange <strong>518 Setores de Votação (Escolas/Locais)</strong> e <strong>3.873 Seções Eleitorais (Urnas)</strong> nas 12 regiões metropolitanas. Os polígonos são gerados por <strong>tesselação de Voronoi contígua (recorte por semiplanos de Sutherland–Hodgman)</strong>: regiões centrais densas produzem microterritórios compactos (~0,2 a 0,8 km²) e zonas periféricas geram setores amplos, compartilhando fronteiras exatas com as escolas vizinhas.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-white/10 font-mono text-[11px] space-y-1.5 text-slate-200">
                <div className="text-emerald-400 font-semibold">
                  ΔLula = max(0, Lula_2T − Lula_1T) | ΔFlávio = Flávio_2T − Flávio_1T
                </div>
                <div>1. Pool_Flavio_Loss = max(0, Flavio_1T − Flavio_2T) [Sangria]</div>
                <div>2. Pool_Abstention_Drop = max(0, Abstencao_1T − Abstencao_2T)</div>
                <div>3. Pool_BlankNull_Drop = max(0, BN_1T − BN_2T)</div>
                <div>4. Pool_Third_Way = Total de votos da 3ª Via no 1º Turno</div>
                <div className="text-sky-400">
                  * Casos onde ΔFlávio &gt; 0 (63 setores) são destacados em Azul Ciano (+22).
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
