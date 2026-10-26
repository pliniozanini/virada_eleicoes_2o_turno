import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapLayerId, SetorVotacao } from '../types/electoral';
import { FACTOR_META } from '../utils/heuristicEngine';

interface InteractiveElectoralMapProps {
  setores: SetorVotacao[];
  activeLayer: MapLayerId;
  onlyFlavioGrew: boolean;
  selectedSetor: SetorVotacao | null;
  onSelectSetor: (setor: SetorVotacao) => void;
  cameraTarget: { center: [number, number]; zoom: number; timestamp: number } | null;
}

function getPolygonFillColor(setor: SetorVotacao, layer: MapLayerId): string {
  if (layer === 'dominant') {
    return FACTOR_META[setor.dominant_factor].color;
  }

  if (layer === 'flavio_loss') {
    // Diverging scale: Sangria (Loss < 0 in Rose/Crimson) vs. Crescimento de Flávio (Gain > 0 in Sky/Cyan)
    if (setor.delta_flavio > 0) {
      const gainRatio = setor.flavio_gain_2t / Math.max(1, setor.flavio_1t);
      if (gainRatio >= 0.16) return '#0284C7'; // sky-600
      if (gainRatio >= 0.10) return '#0EA5E9'; // sky-500
      return '#38BDF8'; // sky-400
    }
    const lossRatio = setor.pool_flavio_loss / Math.max(1, setor.flavio_1t);
    if (lossRatio >= 0.22) return '#E11D48'; // rose-600
    if (lossRatio >= 0.16) return '#F43F5E'; // rose-500
    if (lossRatio >= 0.10) return '#FB7185'; // rose-400
    if (lossRatio >= 0.05) return '#FDA4AF'; // rose-300
    return '#475569';
  }

  if (layer === 'abstention') {
    const abstDropRatio = setor.pool_abstention_drop / Math.max(1, setor.abstencao_1t);
    if (abstDropRatio >= 0.35) return '#D97706';
    if (abstDropRatio >= 0.25) return '#F59E0B';
    if (abstDropRatio >= 0.12) return '#FBBF24';
    if (abstDropRatio >= 0.06) return '#FDE68A';
    return '#38BDF8';
  }

  if (layer === 'third_way') {
    if (setor.pct_third_way >= 55) return '#9333EA';
    if (setor.pct_third_way >= 40) return '#A855F7';
    if (setor.pct_third_way >= 25) return '#C084FC';
    if (setor.pct_third_way >= 15) return '#D8B4FE';
    return '#334155';
  }

  return '#F43F5E';
}

export const InteractiveElectoralMap: React.FC<InteractiveElectoralMapProps> = ({
  setores,
  activeLayer,
  onlyFlavioGrew,
  selectedSetor,
  onSelectSetor,
  cameraTarget,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-23.565, -46.645],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    });

    // Keyless OpenStreetMap tiles rendered in Dark Mode via CSS class `dark-osm-tiles`
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · 27 UFs · 1.343 Setores Voronoi &amp; 12.078 Urnas TSE',
      maxZoom: 19,
      className: 'dark-osm-tiles',
    }).addTo(map);

    L.control
      .zoom({
        position: 'bottomleft',
      })
      .addTo(map);

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !cameraTarget) return;

    map.flyTo(cameraTarget.center, cameraTarget.zoom, {
      animate: true,
      duration: 1.0,
    });
  }, [cameraTarget]);

  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    const visibleSetores = onlyFlavioGrew
      ? setores.filter((s) => s.flavio_grew_2t)
      : setores;

    visibleSetores.forEach((setor) => {
      const isSelected = selectedSetor?.id === setor.id;
      const fillColor = getPolygonFillColor(setor, activeLayer);
      const domMeta = FACTOR_META[setor.dominant_factor];
      const numUrnas = setor.secoes_count || setor.secoes_internas?.length || 8;

      const isFlavioGain = setor.flavio_grew_2t;

      const polygon = L.polygon(setor.polygon, {
        color: isSelected
          ? '#FFFFFF'
          : isFlavioGain && activeLayer === 'dominant'
          ? '#38BDF8'
          : '#0B0F17',
        weight: isSelected ? 3 : isFlavioGain ? 1.8 : 1.1,
        opacity: isSelected ? 1 : 0.85,
        fillColor,
        fillOpacity: isSelected ? 0.72 : 0.52,
      });

      const flavioDeltaStr =
        setor.delta_flavio >= 0
          ? `<span class="text-sky-400 font-semibold">+${setor.delta_flavio} Flávio (Cresceu!)</span>`
          : `<span class="text-rose-400">${setor.delta_flavio} Flávio</span>`;

      const tooltipHtml = `
        <div class="min-w-[235px]">
          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>${setor.cidade}/${setor.uf} · Zona ${setor.zona_eleitoral}</span>
            <span>${setor.area_km2} km² · ${numUrnas} urnas</span>
          </div>
          <div class="text-xs font-bold text-white mt-0.5 leading-snug">
            ${setor.nome_local}
          </div>
          <div class="text-[10px] text-slate-400 truncate">
            ${setor.bairro}
          </div>
          <div class="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-xs font-mono">
            <span class="text-emerald-400 font-semibold">+${setor.delta_lula} Lula</span>
            ${flavioDeltaStr}
          </div>
          <div class="mt-1 flex items-center justify-between text-[11px]">
            <span class="text-slate-400">Destaque:</span>
            <span class="font-semibold" style="color: ${domMeta.color}">${domMeta.shortLabel}</span>
          </div>
        </div>
      `;

      polygon.bindTooltip(tooltipHtml, {
        sticky: true,
        direction: 'top',
        className: 'setor-tooltip',
        offset: [0, -6],
      });

      polygon.on('mouseover', () => {
        if (!isSelected) {
          polygon.setStyle({
            weight: 2.5,
            color: '#FFFFFF',
            fillOpacity: 0.7,
          });
        }
      });

      polygon.on('mouseout', () => {
        if (!isSelected) {
          polygon.setStyle({
            weight: isFlavioGain ? 1.8 : 1.1,
            color:
              isFlavioGain && activeLayer === 'dominant' ? '#38BDF8' : '#0B0F17',
            fillOpacity: 0.52,
          });
        }
      });

      polygon.on('click', () => {
        onSelectSetor(setor);
      });

      polygon.addTo(group);

      // School location pin inside its Voronoi sector
      const centerDot = L.circleMarker(setor.center, {
        radius: isSelected ? 5.5 : isFlavioGain ? 4 : 3,
        color: isFlavioGain ? '#0284C7' : '#090D16',
        weight: 1.2,
        fillColor: isSelected ? '#FFFFFF' : isFlavioGain ? '#38BDF8' : fillColor,
        fillOpacity: 1,
      });

      centerDot.on('click', () => {
        onSelectSetor(setor);
      });

      centerDot.addTo(group);
    });
  }, [setores, activeLayer, onlyFlavioGrew, selectedSetor, onSelectSetor]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
    </div>
  );
};
