import React from 'react';
import { ChevronLeft, ChevronRight, Compass, X } from 'lucide-react';
import { GuidedTourStep } from '../types/electoral';

interface GuidedTourOverlayProps {
  steps: GuidedTourStep[];
  currentIndex: number;
  onSelectStep: (index: number) => void;
  onClose: () => void;
}

export const GuidedTourOverlay: React.FC<GuidedTourOverlayProps> = ({
  steps,
  currentIndex,
  onSelectStep,
  onClose,
}) => {
  const step = steps[currentIndex];
  if (!step) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 w-[640px] max-w-[calc(100vw-24px)] bg-[#0F172A]/96 backdrop-blur-xl border border-rose-500/40 rounded-xl shadow-2xl p-4 text-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-mono text-rose-400">
          <Compass className="w-4 h-4 shrink-0" />
          <span>
            TOUR GUIADO DA VIRADA · CAPÍTULO {step.step} DE {steps.length}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-400 font-semibold">{step.destaqueMetrica}</span>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Sair do Tour Guiado"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <h3 className="text-base font-bold text-white mt-1">{step.titulo}</h3>
      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{step.narrativa}</p>

      <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
        {/* Step Progress Indicators */}
        <div className="flex items-center gap-1.5">
          {steps.map((s, idx) => (
            <button
              key={s.step}
              onClick={() => onSelectStep(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex
                  ? 'w-7 bg-rose-500'
                  : 'w-2 bg-slate-700 hover:bg-slate-500'
              }`}
              aria-label={`Ir para capítulo ${s.step}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectStep(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 flex items-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Anterior
          </button>
          <button
            onClick={() =>
              currentIndex < steps.length - 1
                ? onSelectStep(currentIndex + 1)
                : onClose()
            }
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
          >
            {currentIndex < steps.length - 1 ? (
              <>
                Próximo Capítulo
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            ) : (
              'Concluir Tour'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
