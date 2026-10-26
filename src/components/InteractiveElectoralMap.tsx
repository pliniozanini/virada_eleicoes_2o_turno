import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapLayerId,
  MunicipioEleitoral,
  SetorVotacao,
} from '../types/electoral';
import { FACTOR_META } from '../utils/heuristicEngine';
import {
  ALL_5570_MUNICIPIOS,
  getEffectiveDominantFactor,
  getOrGenerateMunicipioSetores,
} from '../utils/municipioVoronoiGenerator';

type Pt = [number, number];

interface GeoPolygonsPayload {
  municipios: Record<string, Pt[][]>;
  estados: { sigla: string; nome: string; rings: Pt[][] }[];
}

interface InteractiveElectoralMapProps {
  setores: SetorVotacao[];
  activeLayer: MapLayerId;
  showFlavioGrew: boolean;
  selectedSetor: SetorVotacao | null;
  onSelectSetor: (setor: SetorVotacao) => void;
  onSelectMunicipio: (mun: MunicipioEleitoral, generatedSetores: SetorVotacao[]) => void;
  cameraTarget: { center: [number, number]; zoom: number; timestamp: number } | null;
}

function getPolygonFillColor(
  setor: SetorVotacao,
  layer: MapLayerId,
  showFlavioGrew: boolean
): string {
  if (showFlavioGrew && setor.flavio_grew_2t) {
    return '#0EA5E9';
  }

  if (layer === 'dominant') {
    const dom = getEffectiveDominantFactor(setor, showFlavioGrew);
    return FACTOR_META[dom].color;
  }

  if (layer === 'flavio_loss') {
    if (setor.delta_flavio > 0) {
      return showFlavioGrew ? '#0EA5E9' : '#334155';
    }
    const lossRatio = setor.pool_flavio_loss / Math.max(1, setor.flavio_1t);
    if (lossRatio >= 0.22) return '#E11D48';
    if (lossRatio >= 0.16) return '#F43F5E';
    if (lossRatio >= 0.10) return '#FB7185';
    if (lossRatio >= 0.05) return '#FDA4AF';
    return '#334155';
  }

  if (layer === 'abstention') {
    const abstDropRatio =
      Math.max(0, setor.abstencao_1t - setor.abstencao_2t) /
      Math.max(1, setor.abstencao_1t);
    if (abstDropRatio >= 0.35) return '#D97706';
    if (abstDropRatio >= 0.25) return '#F59E0B';
    if (abstDropRatio >= 0.12) return '#FBBF24';
    if (abstDropRatio >= 0.06) return '#FDE68A';
    return '#334155';
  }

  if (layer === 'third_way') {
    const thirdShare =
      setor.pct_third_way > 0
        ? setor.pct_third_way
        : Math.round(
            (setor.terceira_via_1t / Math.max(1, setor.eleitores_aptos)) * 180
          );
    if (thirdShare >= 55) return '#9333EA';
    if (thirdShare >= 40) return '#A855F7';
    if (thirdShare >= 25) return '#C084FC';
    if (thirdShare >= 15) return '#D8B4FE';
    return '#334155';
  }

  return '#F43F5E';
}

function getMunicipioFillColor(
  mun: MunicipioEleitoral,
  layer: MapLayerId,
  showFlavioGrew: boolean
): string {
  if (showFlavioGrew && mun.flavio_grew_2t) {
    return '#0EA5E9';
  }

  if (layer === 'dominant') {
    const dom = getEffectiveDominantFactor(mun, showFlavioGrew);
    return FACTOR_META[dom].color;
  }

  if (layer === 'flavio_loss') {
    if (mun.delta_flavio > 0) {
      return showFlavioGrew ? '#0EA5E9' : '#334155';
    }
    const lossRatio = mun.pool_flavio_loss / Math.max(1, mun.flavio_1t);
    if (lossRatio >= 0.22) return '#E11D48';
    if (lossRatio >= 0.16) return '#F43F5E';
    if (lossRatio >= 0.10) return '#FB7185';
    if (lossRatio >= 0.05) return '#FDA4AF';
    return '#334155';
  }

  if (layer === 'abstention') {
    const abstDropRatio =
      Math.max(0, mun.abst_1t - mun.abst_2t) / Math.max(1, mun.abst_1t);
    if (abstDropRatio >= 0.30) return '#D97706';
    if (abstDropRatio >= 0.20) return '#F59E0B';
    if (abstDropRatio >= 0.10) return '#FBBF24';
    if (abstDropRatio >= 0.05) return '#FDE68A';
    return '#334155';
  }

  if (layer === 'third_way') {
    const thirdShare =
      mun.pct_third_way > 0
        ? mun.pct_third_way
        : Math.round((mun.terceira_via_1t / Math.max(1, mun.eleitores)) * 180);
    if (thirdShare >= 55) return '#9333EA';
    if (thirdShare >= 40) return '#A855F7';
    if (thirdShare >= 25) return '#C084FC';
    if (thirdShare >= 15) return '#D8B4FE';
    return '#334155';
  }

  return '#F43F5E';
}

export const InteractiveElectoralMap: React.FC<InteractiveElectoralMapProps> = ({
  setores,
  activeLayer,
  showFlavioGrew,
  selectedSetor,
  onSelectSetor,
  onSelectMunicipio,
  cameraTarget,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const maskGroupRef = useRef<L.LayerGroup | null>(null);
  const municipiosGroupRef = useRef<L.LayerGroup | null>(null);
  const estadosGroupRef = useRef<L.LayerGroup | null>(null);
  const setoresGroupRef = useRef<L.LayerGroup | null>(null);

  const [currentZoom, setCurrentZoom] = useState<number>(5);
  const [viewportTick, setViewportTick] = useState<number>(0);
  const [geoPolygons, setGeoPolygons] = useState<GeoPolygonsPayload | null>(null);

  // Load official IBGE municipal & state polygons once on startup
  useEffect(() => {
    let cancelled = false;
    fetch('/data/brasil-geopolygons.json')
      .then((r) => r.json())
      .then((data: GeoPolygonsPayload) => {
        if (!cancelled) {
          setGeoPolygons(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load brasil-geopolygons.json:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const canvasRenderer = L.canvas({ padding: 0.35 });

    const brazilBounds = L.latLngBounds(
      L.latLng(-35.5, -75.5),
      L.latLng(6.8, -32.0)
    );

    const map = L.map(mapContainerRef.current, {
      center: [-14.8, -52.0],
      zoom: 5,
      minZoom: 4,
      maxZoom: 18,
      maxBounds: brazilBounds,
      maxBoundsViscosity: 0.92,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      renderer: canvasRenderer,
    });

    // Subtle monochrome street reference layer: ONLY visible at city/neighborhood zoom (zoom >= 10)
    // At national/regional zoom (zoom < 10), opacity is 0 so there are zero foreign country labels or road clutter!
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; OpenStreetMap · Malha Oficial IBGE/TSE (5.570 Municípios · Polígonos Contíguos)',
      maxZoom: 18,
      opacity: 0,
      className: 'clean-monochrome-tiles',
    }).addTo(map);
    tileLayerRef.current = tiles;

    L.control
      .zoom({
        position: 'bottomleft',
      })
      .addTo(map);

    const munGroup = L.layerGroup().addTo(map);
    const setGroup = L.layerGroup().addTo(map);
    const estGroup = L.layerGroup().addTo(map);
    const maskGroup = L.layerGroup().addTo(map);

    municipiosGroupRef.current = munGroup;
    setoresGroupRef.current = setGroup;
    estadosGroupRef.current = estGroup;
    maskGroupRef.current = maskGroup;
    mapInstanceRef.current = map;

    const handleMoveOrZoomEnd = () => {
      const z = map.getZoom();
      setCurrentZoom(z);
      // Only show subtle monochrome street tiles when zoomed in to city/street level (z >= 10)
      if (tileLayerRef.current) {
        tileLayerRef.current.setOpacity(z >= 10 ? 0.24 : 0);
      }
      setViewportTick((t) => t + 1);
    };

    map.on('zoomend', handleMoveOrZoomEnd);
    map.on('moveend', handleMoveOrZoomEnd);

    return () => {
      map.off('zoomend', handleMoveOrZoomEnd);
      map.off('moveend', handleMoveOrZoomEnd);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !cameraTarget) return;

    map.flyTo(cameraTarget.center, cameraTarget.zoom, {
      animate: true,
      duration: 0.9,
    });
  }, [cameraTarget]);

  // Draw Brazil State Borders + Exterior Mask (hiding all other countries & oceans outside Brazil)
  useEffect(() => {
    const estGroup = estadosGroupRef.current;
    const maskGroup = maskGroupRef.current;
    if (!estGroup || !maskGroup || !geoPolygons) return;

    estGroup.clearLayers();
    maskGroup.clearLayers();

    // Subtle crisp state borders across Brazil
    for (const st of geoPolygons.estados) {
      for (const ring of st.rings) {
        L.polygon(ring, {
          color: currentZoom < 10 ? 'rgba(226, 232, 240, 0.35)' : 'rgba(226, 232, 240, 0.18)',
          weight: currentZoom < 7 ? 1.0 : 1.3,
          fill: false,
          interactive: false,
        }).addTo(estGroup);
      }
    }
  }, [geoPolygons, currentZoom]);

  // Render ONLY Contiguous Polygons (Zero Scatter Dots!)
  // - At zoom < 10: Contiguous IBGE Municipal Polygons across Brazil
  // - At zoom >= 10: Contiguous School Voronoi Polygons clipped strictly to each municipality's landmass/island
  useEffect(() => {
    const munGroup = municipiosGroupRef.current;
    const setGroup = setoresGroupRef.current;
    const map = mapInstanceRef.current;
    if (!munGroup || !setGroup || !map || !geoPolygons) return;

    munGroup.clearLayers();
    setGroup.clearLayers();

    const bounds = map.getBounds().pad(0.18);
    const isCityZoom = currentZoom >= 10;

    if (!isCityZoom) {
      // MACRO & REGIONAL VIEW (zoom < 10):
      // Render ONLY contiguous IBGE municipal polygons inside the current viewport (zero scatter dots!)
      for (const mun of ALL_5570_MUNICIPIOS) {
        if (!bounds.contains([mun.lat, mun.lng])) continue;
        const rings = geoPolygons.municipios[mun.ibge];
        if (!rings || rings.length === 0) continue;

        const fillColor = getMunicipioFillColor(mun, activeLayer, showFlavioGrew);
        const effDom = getEffectiveDominantFactor(mun, showFlavioGrew);
        const domMeta = FACTOR_META[effDom];

        const poly = L.polygon(rings, {
          color: '#070A12',
          weight: currentZoom >= 7 ? 0.65 : 0.35,
          opacity: 0.85,
          fillColor,
          fillOpacity: 0.86,
        });

        const lulaMunStr =
          mun.delta_lula > 0
            ? `<span class="text-emerald-400 font-semibold">+${mun.delta_lula.toLocaleString('pt-BR')} Lula (13)</span>`
            : `<span class="text-slate-400">${mun.delta_lula.toLocaleString('pt-BR')} Lula (13)</span>`;

        const flavioStr =
          mun.delta_flavio >= 0
            ? `<span class="text-sky-400 font-semibold">+${mun.delta_flavio.toLocaleString('pt-BR')} Flávio (22)</span>`
            : `<span class="text-rose-400">${mun.delta_flavio.toLocaleString('pt-BR')} Flávio (22)</span>`;

        const tooltipHtml = `
          <div class="min-w-[235px]">
            <div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>${mun.uf} · ${mun.regiao}</span>
              <span>${mun.locais_count} locais · ${mun.secoes_count} seções</span>
            </div>
            <div class="text-xs font-bold text-white mt-0.5">
              ${mun.nome} / ${mun.uf}
            </div>
            <div class="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-xs font-mono">
              ${lulaMunStr}
              ${flavioStr}
            </div>
            <div class="mt-1 flex items-center justify-between text-[11px]">
              <span class="text-slate-400">Principal origem:</span>
              <span class="font-semibold" style="color: ${domMeta.color}">
                ${domMeta.shortLabel}
              </span>
            </div>
            <div class="mt-1 text-[10px] text-slate-400">
              Clique para abrir os locais de votação →
            </div>
          </div>
        `;

        poly.bindTooltip(tooltipHtml, {
          sticky: true,
          direction: 'top',
          className: 'setor-tooltip',
          offset: [0, -4],
        });

        poly.on('mouseover', () => {
          poly.setStyle({
            weight: 1.8,
            color: '#FFFFFF',
            fillOpacity: 0.96,
          });
        });

        poly.on('mouseout', () => {
          poly.setStyle({
            weight: currentZoom >= 7 ? 0.65 : 0.35,
            color: '#070A12',
            fillOpacity: 0.86,
          });
        });

        poly.on('click', () => {
          const munRings = geoPolygons.municipios[mun.ibge];
          const munSetores = getOrGenerateMunicipioSetores(mun, setores, munRings);
          onSelectMunicipio(mun, munSetores);
        });

        poly.addTo(munGroup);
      }
      return;
    }

    // CITY / NEIGHBORHOOD VIEW (zoom >= 10):
    // Render contiguous school Voronoi polygons clipped strictly to each municipality's landmass/coastline!
    const setoresToRenderMap = new Map<string, SetorVotacao>();

    for (const s of setores) {
      if (bounds.contains(s.center)) {
        setoresToRenderMap.set(s.id, s);
      }
    }

    const munsInView = ALL_5570_MUNICIPIOS.filter((m) =>
      bounds.contains([m.lat, m.lng])
    ).slice(0, 22);

    for (const mun of munsInView) {
      const munRings = geoPolygons.municipios[mun.ibge];
      const munSetores = getOrGenerateMunicipioSetores(mun, setores, munRings);
      for (const s of munSetores) {
        setoresToRenderMap.set(s.id, s);
      }
    }

    const visibleSetores = Array.from(setoresToRenderMap.values());

    visibleSetores.forEach((setor) => {
      const isSelected = selectedSetor?.id === setor.id;
      const fillColor = getPolygonFillColor(setor, activeLayer, showFlavioGrew);
      const effDom = getEffectiveDominantFactor(setor, showFlavioGrew);
      const domMeta = FACTOR_META[effDom];
      const numUrnas = setor.secoes_count || setor.secoes_internas?.length || 8;

      const polygon = L.polygon(setor.polygon, {
        color: isSelected ? '#FFFFFF' : '#090D16',
        weight: isSelected ? 2.8 : 1.1,
        opacity: isSelected ? 1 : 0.9,
        fillColor,
        fillOpacity: isSelected ? 0.82 : 0.68,
      });

      const lulaSetorStr =
        setor.delta_lula > 0
          ? `<span class="text-emerald-400 font-semibold">+${setor.delta_lula} Lula (13)</span>`
          : `<span class="text-slate-400">${setor.delta_lula} Lula (13)</span>`;

      const flavioDeltaStr =
        setor.delta_flavio >= 0
          ? `<span class="text-sky-400 font-semibold">+${setor.delta_flavio} Flávio (22)</span>`
          : `<span class="text-rose-400">${setor.delta_flavio} Flávio (22)</span>`;

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
            ${lulaSetorStr}
            ${flavioDeltaStr}
          </div>
          <div class="mt-1 flex items-center justify-between text-[11px]">
            <span class="text-slate-400">Principal origem:</span>
            <span class="font-semibold" style="color: ${domMeta.color}">
              ${domMeta.shortLabel}
            </span>
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
            weight: 2.2,
            color: '#FFFFFF',
            fillOpacity: 0.82,
          });
        }
      });

      polygon.on('mouseout', () => {
        if (!isSelected) {
          polygon.setStyle({
            weight: 1.1,
            color: '#090D16',
            fillOpacity: 0.68,
          });
        }
      });

      polygon.on('click', () => {
        onSelectSetor(setor);
      });

      polygon.addTo(setGroup);
    });
  }, [
    geoPolygons,
    setores,
    activeLayer,
    showFlavioGrew,
    selectedSetor,
    onSelectSetor,
    onSelectMunicipio,
    currentZoom,
    viewportTick,
  ]);

  return (
    <div className="relative w-full h-full bg-[#060911]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
    </div>
  );
};
