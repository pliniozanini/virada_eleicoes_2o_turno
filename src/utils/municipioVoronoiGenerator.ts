import {
  DominantFactorKey,
  IncomeBracketKey,
  MunicipioEleitoral,
  SetorVotacao,
} from '../types/electoral';
import {
  RAW_BRASIL_5570_MUNICIPIOS,
  BRASIL_5570_STATS,
} from '../data/brasil5570Municipios';

export { BRASIL_5570_STATS };

const UF_REGIAO_MAP: Record<
  string,
  'Sudeste' | 'Nordeste' | 'Sul' | 'Centro-Oeste' | 'Norte'
> = {
  SP: 'Sudeste',
  RJ: 'Sudeste',
  MG: 'Sudeste',
  ES: 'Sudeste',
  BA: 'Nordeste',
  PE: 'Nordeste',
  CE: 'Nordeste',
  MA: 'Nordeste',
  PB: 'Nordeste',
  RN: 'Nordeste',
  AL: 'Nordeste',
  SE: 'Nordeste',
  PI: 'Nordeste',
  RS: 'Sul',
  PR: 'Sul',
  SC: 'Sul',
  GO: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  DF: 'Centro-Oeste',
  PA: 'Norte',
  AM: 'Norte',
  RO: 'Norte',
  TO: 'Norte',
  AC: 'Norte',
  AP: 'Norte',
  RR: 'Norte',
};

export const ALL_UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

function hydrateMunicipios(): MunicipioEleitoral[] {
  return RAW_BRASIL_5570_MUNICIPIOS.map((t) => {
    const [
      ibge,
      nome,
      uf,
      lat,
      lng,
      capitalNum,
      locais_count,
      secoes_count,
      lula_1t,
      flavio_1t,
      terceira_via_1t,
      bn_1t,
      abst_1t,
      lula_2t,
      flavio_2t,
      bn_2t,
      abst_2t,
      renda_sm,
    ] = t;

    const eleitores = lula_1t + flavio_1t + terceira_via_1t + bn_1t + abst_1t;
    const delta_lula = lula_2t - lula_1t;
    const delta_flavio = flavio_2t - flavio_1t;
    const flavio_grew_2t = delta_flavio > 0 || delta_lula <= 0;
    const flavio_gain_2t = Math.max(0, delta_flavio);

    // Where Flavio grew / Lula did NOT grow, the 4 Lula-growth pools do not apply (0)
    const pool_flavio_loss = flavio_grew_2t ? 0 : Math.max(0, flavio_1t - flavio_2t);
    const pool_abstention_drop = flavio_grew_2t ? 0 : Math.max(0, abst_1t - abst_2t);
    const pool_blank_null_drop = flavio_grew_2t ? 0 : Math.max(0, bn_1t - bn_2t);
    const pool_third_way = flavio_grew_2t ? 0 : terceira_via_1t;
    const pool_total = Math.max(
      1,
      pool_flavio_loss + pool_abstention_drop + pool_blank_null_drop + pool_third_way
    );

    const pct_flavio_loss = flavio_grew_2t
      ? 0
      : Math.round((pool_flavio_loss / pool_total) * 100);
    const pct_abstention_drop = flavio_grew_2t
      ? 0
      : Math.round((pool_abstention_drop / pool_total) * 100);
    const pct_blank_null_drop = flavio_grew_2t
      ? 0
      : Math.round((pool_blank_null_drop / pool_total) * 100);
    const pct_third_way = flavio_grew_2t
      ? 0
      : Math.max(0, 100 - pct_flavio_loss - pct_abstention_drop - pct_blank_null_drop);

    let dominant_factor: DominantFactorKey = 'third_way';
    if (flavio_grew_2t) {
      dominant_factor = 'flavio_gain';
    } else {
      const pairs: { k: DominantFactorKey; v: number }[] = [
        { k: 'flavio_loss', v: pool_flavio_loss },
        { k: 'abstention_drop', v: pool_abstention_drop },
        { k: 'third_way', v: pool_third_way },
        { k: 'blank_null_drop', v: pool_blank_null_drop },
      ];
      pairs.sort((a, b) => b.v - a.v);
      dominant_factor = pairs[0].k;
    }

    return {
      ibge,
      nome,
      uf,
      regiao: UF_REGIAO_MAP[uf] || 'Sudeste',
      lat,
      lng,
      capital: capitalNum === 1,
      locais_count,
      secoes_count,
      eleitores,
      lula_1t,
      flavio_1t,
      terceira_via_1t,
      bn_1t,
      abst_1t,
      lula_2t,
      flavio_2t,
      bn_2t,
      abst_2t,
      delta_lula,
      delta_flavio,
      flavio_grew_2t,
      flavio_gain_2t,
      pool_flavio_loss,
      pool_abstention_drop,
      pool_third_way,
      pool_blank_null_drop,
      pct_flavio_loss,
      pct_abstention_drop,
      pct_third_way,
      pct_blank_null_drop,
      dominant_factor,
      renda_sm,
    };
  });
}

export const ALL_5570_MUNICIPIOS: MunicipioEleitoral[] = hydrateMunicipios();

type Pt = [number, number];

export function clipPolygonByBisector(
  poly: Pt[],
  site: Pt,
  other: Pt,
  latScale: number
): Pt[] {
  if (poly.length === 0) return [];
  const midLat = (site[0] + other[0]) / 2;
  const midLng = (site[1] + other[1]) / 2;
  const nx = other[0] - site[0];
  const ny = (other[1] - site[1]) * latScale;
  if (Math.hypot(nx, ny) < 1e-8) return poly;

  const inside = (p: Pt) => {
    const dx = p[0] - midLat;
    const dy = (p[1] - midLng) * latScale;
    return dx * nx + dy * ny <= 1e-9;
  };

  const intersect = (a: Pt, b: Pt): Pt => {
    const dax = a[0] - midLat;
    const day = (a[1] - midLng) * latScale;
    const dbx = b[0] - midLat;
    const dby = (b[1] - midLng) * latScale;
    const valA = dax * nx + day * ny;
    const valB = dbx * nx + dby * ny;
    const denom = valA - valB;
    const t = Math.abs(denom) < 1e-12 ? 0.5 : valA / denom;
    return [
      Number((a[0] + t * (b[0] - a[0])).toFixed(5)),
      Number((a[1] + t * (b[1] - a[1])).toFixed(5)),
    ];
  };

  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);

    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

function clipPolygonByHalfPlane(
  poly: Pt[],
  originLat: number,
  originLng: number,
  nx: number,
  ny: number,
  maxProj: number,
  latScale: number
): Pt[] {
  if (poly.length === 0) return [];
  const evalPt = (p: Pt) =>
    (p[0] - originLat) * nx + (p[1] - originLng) * latScale * ny - maxProj;

  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const valCur = evalPt(cur);
    const valPrev = evalPt(prev);
    const curIn = valCur <= 1e-9;
    const prevIn = valPrev <= 1e-9;

    if (curIn) {
      if (!prevIn) {
        const t = valPrev / (valPrev - valCur);
        out.push([
          Number((prev[0] + t * (cur[0] - prev[0])).toFixed(5)),
          Number((prev[1] + t * (cur[1] - prev[1])).toFixed(5)),
        ]);
      }
      out.push(cur);
    } else if (prevIn) {
      const t = valPrev / (valPrev - valCur);
      out.push([
        Number((prev[0] + t * (cur[0] - prev[0])).toFixed(5)),
        Number((prev[1] + t * (cur[1] - prev[1])).toFixed(5)),
      ]);
    }
  }
  return out;
}

export function buildSharedConvexEnvelope(
  centers: Pt[],
  latScale: number,
  marginDeg = 0.015
): Pt[] {
  if (centers.length === 0) return [];
  let sumLat = 0;
  let sumLng = 0;
  for (const c of centers) {
    sumLat += c[0];
    sumLng += c[1];
  }
  const meanLat = sumLat / centers.length;
  const meanLng = sumLng / centers.length;

  const span = 1.5;
  let hull: Pt[] = [
    [meanLat - span, meanLng - span],
    [meanLat - span, meanLng + span],
    [meanLat + span, meanLng + span],
    [meanLat + span, meanLng - span],
  ];

  const dirs = 16;
  for (let d = 0; d < dirs; d++) {
    const angle = (Math.PI * 2 * d) / dirs;
    const nx = Math.sin(angle);
    const ny = Math.cos(angle);
    let maxProj = 0;
    for (const c of centers) {
      const proj = (c[0] - meanLat) * nx + (c[1] - meanLng) * latScale * ny;
      if (proj > maxProj) maxProj = proj;
    }
    hull = clipPolygonByHalfPlane(
      hull,
      meanLat,
      meanLng,
      nx,
      ny,
      maxProj + marginDeg,
      latScale
    );
  }
  return hull;
}

export function computePolygonAreaKm2(poly: Pt[], lat: number): number {
  if (poly.length < 3) return 0.5;
  const kmPerDegLat = 111.132;
  const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [y1, x1] = poly[i];
    const [y2, x2] = poly[(i + 1) % poly.length];
    area += x1 * kmPerDegLng * (y2 * kmPerDegLat) - x2 * kmPerDegLng * (y1 * kmPerDegLat);
  }
  return Number(Math.max(0.12, Math.abs(area) / 2).toFixed(2));
}

function pointInPolygon(pt: Pt, vs: Pt[]): boolean {
  const x = pt[1];
  const y = pt[0];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][1];
    const yi = vs[i][0];
    const xj = vs[j][1];
    const yj = vs[j][0];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pullPointInsideRing(pt: Pt, ring: Pt[], anchor: Pt): Pt {
  if (pointInPolygon(pt, ring)) return pt;
  for (let step = 0.1; step <= 1.0; step += 0.1) {
    const cand: Pt = [
      Number((pt[0] + (anchor[0] - pt[0]) * step).toFixed(5)),
      Number((pt[1] + (anchor[1] - pt[1]) * step).toFixed(5)),
    ];
    if (pointInPolygon(cand, ring)) return cand;
  }
  const sorted = [...ring].sort(
    (a, b) => Math.hypot(a[0] - pt[0], a[1] - pt[1]) - Math.hypot(b[0] - pt[0], b[1] - pt[1])
  );
  const cLat = (sorted[0][0] + sorted[1][0] + anchor[0]) / 3;
  const cLng = (sorted[0][1] + sorted[1][1] + anchor[1]) / 3;
  return [Number(cLat.toFixed(5)), Number(cLng.toFixed(5))];
}

/**
 * Returns the dominant factor to display on the map.
 * When `showFlavioGrew` is FALSE (default), 'flavio_gain' is turned OFF and the unit is colored
 * by the #1 positive vote source pool for Lula (third_way, abstention_drop, flavio_loss, or blank_null_drop).
 */
export function getEffectiveDominantFactor(
  unit: {
    dominant_factor: DominantFactorKey;
    flavio_grew_2t: boolean;
    terceira_via_1t: number;
    abstencao_1t?: number;
    abstencao_2t?: number;
    abst_1t?: number;
    abst_2t?: number;
    brancos_nulos_1t?: number;
    brancos_nulos_2t?: number;
    bn_1t?: number;
    bn_2t?: number;
    flavio_1t: number;
    flavio_2t: number;
  },
  showFlavioGrew: boolean
): DominantFactorKey {
  if (showFlavioGrew && unit.flavio_grew_2t) {
    return 'flavio_gain';
  }
  if (unit.dominant_factor !== 'flavio_gain') {
    return unit.dominant_factor;
  }
  // Compute fallback dominant Lula factor when "Expansão 22" is toggled OFF
  const abst1 = unit.abstencao_1t ?? unit.abst_1t ?? 0;
  const abst2 = unit.abstencao_2t ?? unit.abst_2t ?? 0;
  const bn1 = unit.brancos_nulos_1t ?? unit.bn_1t ?? 0;
  const bn2 = unit.brancos_nulos_2t ?? unit.bn_2t ?? 0;

  const pFlavio = Math.max(0, unit.flavio_1t - unit.flavio_2t);
  const pAbst = Math.max(0, abst1 - abst2);
  const pBn = Math.max(0, bn1 - bn2);
  const pThird = Math.max(1, Math.round(unit.terceira_via_1t * 0.45));

  const pairs: [DominantFactorKey, number][] = [
    ['third_way', pThird],
    ['abstention_drop', pAbst],
    ['flavio_loss', pFlavio],
    ['blank_null_drop', pBn],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs[0][0];
}

const BAIRROS_MUNICIPIO = [
  'Centro',
  'Vila Nova',
  'São José',
  'Boa Vista',
  'Jardim América',
  'Santa Luzia',
  'Bela Vista',
  'Santo Antônio',
  'São Cristóvão',
  'Industrial',
  'Novo Horizonte',
  'São Francisco',
  'Parque das Nações',
  'Cohab',
  'Alto da Boa Vista',
  'Planalto',
  'Cruzeiro',
  'Nossa Senhora Aparecida',
];

const ESCOLAS_PREFIX = [
  'EE Prof. Antônio Carlos',
  'EMEF Dom Pedro II',
  'Colégio Estadual Tiradentes',
  'EM Presidente Vargas',
  'EE Marechal Rondon',
  'CIEP Monteiro Lobato',
  'EMEF Cecília Meireles',
  'Colégio Estadual Castro Alves',
  'EE Santos Dumont',
  'EMEF Rui Barbosa',
  'EE Juscelino Kubitschek',
  'EMEF Cora Coralina',
  'Colégio Estadual Rio Branco',
  'EM Ayrton Senna',
];

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const municipioVoronoiCache = new Map<string, SetorVotacao[]>();

export function getOrGenerateMunicipioSetores(
  mun: MunicipioEleitoral,
  precomputedSetores: SetorVotacao[],
  munLandmassRings?: Pt[][]
): SetorVotacao[] {
  const cacheKey = `${mun.ibge}-${munLandmassRings ? 'land' : 'box'}`;
  if (municipioVoronoiCache.has(cacheKey)) {
    return municipioVoronoiCache.get(cacheKey)!;
  }

  const existing = precomputedSetores.filter(
    (s) =>
      s.cidade.toLowerCase() === mun.nome.toLowerCase() &&
      s.uf.toLowerCase() === mun.uf.toLowerCase()
  );
  if (existing.length > 0) {
    municipioVoronoiCache.set(cacheKey, existing);
    return existing;
  }

  const rng = seededRandom(mun.ibge * 31 + 17);
  const count = Math.min(20, Math.max(6, mun.locais_count));
  const cosLat = Math.max(0.5, Math.cos((mun.lat * Math.PI) / 180));

  const mainRing = munLandmassRings?.[0];
  let ringCentroid: Pt = [mun.lat, mun.lng];
  let ringRadiusLat = 0.025;
  let ringRadiusLng = 0.025 / cosLat;

  if (mainRing && mainRing.length >= 3) {
    let minLat = 99,
      maxLat = -99,
      minLng = 99,
      maxLng = -99;
    let sumLat = 0,
      sumLng = 0;
    for (const [lat, lng] of mainRing) {
      sumLat += lat;
      sumLng += lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    ringCentroid = pullPointInsideRing(
      [sumLat / mainRing.length, sumLng / mainRing.length],
      mainRing,
      mainRing[0]
    );
    ringRadiusLat = Math.max(0.008, (maxLat - minLat) * 0.36);
    ringRadiusLng = Math.max(0.008, (maxLng - minLng) * 0.36);
  }

  const centers: Pt[] = [];
  for (let i = 0; i < count; i++) {
    let rawPt: Pt;
    if (i === 0) {
      rawPt = [
        Number((ringCentroid[0] + (rng() - 0.5) * 0.002).toFixed(5)),
        Number((ringCentroid[1] + (rng() - 0.5) * 0.002).toFixed(5)),
      ];
    } else {
      const rFrac = i < count * 0.45 ? 0.35 + rng() * 0.25 : 0.65 + rng() * 0.3;
      const angle = (Math.PI * 2 * i) / (count - 1) + (rng() - 0.5) * 0.35;
      rawPt = [
        Number((ringCentroid[0] + Math.sin(angle) * ringRadiusLat * rFrac).toFixed(5)),
        Number((ringCentroid[1] + Math.cos(angle) * ringRadiusLng * rFrac).toFixed(5)),
      ];
    }
    centers.push(
      mainRing ? pullPointInsideRing(rawPt, mainRing, ringCentroid) : rawPt
    );
  }

  // Use exact IBGE municipal landmass ring when available so polygons never go over water or cross municipal borders!
  const baseHull =
    mainRing && mainRing.length >= 3
      ? mainRing
      : buildSharedConvexEnvelope(centers, cosLat, 0.014);
  const generatedSetores: SetorVotacao[] = [];
  const secoesPerSetor = Math.max(4, Math.round(mun.secoes_count / count));

  for (let i = 0; i < count; i++) {
    const site = centers[i];
    let poly: Pt[] = [...baseHull];

    const sortedOthers = centers
      .filter((_, j) => j !== i)
      .sort(
        (a, b) =>
          Math.hypot(a[0] - site[0], (a[1] - site[1]) * cosLat) -
          Math.hypot(b[0] - site[0], (b[1] - site[1]) * cosLat)
      );

    for (const other of sortedOthers) {
      poly = clipPolygonByBisector(poly, site, other, cosLat);
    }

    const areaKm2 = computePolygonAreaKm2(poly, site[0]);
    const polygonLatLng: [number, number][] = poly;
    const [latI, lngI] = site;

    // Distribute municipality votes across sectors with realistic local variation
    const weight = (0.82 + rng() * 0.36) / count;
    const lula_1t = Math.max(40, Math.round(mun.lula_1t * weight));
    const flavio_1t = Math.max(35, Math.round(mun.flavio_1t * weight));
    const terceira_via_1t = Math.max(15, Math.round(mun.terceira_via_1t * weight));
    const brancos_nulos_1t = Math.max(8, Math.round(mun.bn_1t * weight));
    const abstencao_1t = Math.max(25, Math.round(mun.abst_1t * weight));
    const eleitores_aptos =
      lula_1t + flavio_1t + terceira_via_1t + brancos_nulos_1t + abstencao_1t;

    // Allow neighborhood variation inside the municipality
    const isFlavioSectorGain =
      mun.flavio_grew_2t ? i % 4 !== 3 : i === count - 1 && rng() < 0.28;

    let flavio_2t = Math.max(25, Math.round(mun.flavio_2t * weight));
    let lula_2t = Math.max(20, Math.round(mun.lula_2t * weight));

    if (isFlavioSectorGain) {
      // Where Flavio grew, Lula did NOT grow (lula_2t < lula_1t) and Lula-growth pools do not apply
      const lulaDrop = Math.max(12, Math.round(lula_1t * (0.05 + rng() * 0.05)));
      lula_2t = Math.max(15, lula_1t - lulaDrop);
      if (flavio_2t <= flavio_1t) {
        flavio_2t =
          flavio_1t + Math.max(18, Math.round(terceira_via_1t * 0.65) + lulaDrop);
      }
    } else {
      if (flavio_2t >= flavio_1t) {
        flavio_2t = Math.round(flavio_1t * 0.88);
      }
      if (lula_2t <= lula_1t) {
        lula_2t = lula_1t + Math.max(24, Math.round(terceira_via_1t * 0.72));
      }
    }

    const brancos_nulos_2t = Math.max(5, Math.round(mun.bn_2t * weight));
    const abstencao_2t = Math.max(18, Math.round(mun.abst_2t * weight));

    const delta_lula = lula_2t - lula_1t;
    const delta_flavio = flavio_2t - flavio_1t;
    const flavio_grew_2t = delta_flavio > 0 || delta_lula <= 0;
    const flavio_gain_2t = Math.max(0, delta_flavio);
    const delta_abstencao = abstencao_2t - abstencao_1t;

    const pool_flavio_loss = flavio_grew_2t ? 0 : Math.max(0, flavio_1t - flavio_2t);
    const pool_abstention_drop = flavio_grew_2t ? 0 : Math.max(0, abstencao_1t - abstencao_2t);
    const pool_blank_null_drop = flavio_grew_2t
      ? 0
      : Math.max(0, brancos_nulos_1t - brancos_nulos_2t);
    const pool_third_way = flavio_grew_2t ? 0 : terceira_via_1t;
    const pool_total =
      pool_flavio_loss + pool_abstention_drop + pool_blank_null_drop + pool_third_way;

    const lulaPosGain = Math.max(0, delta_lula);
    const attr_flavio_loss =
      !flavio_grew_2t && pool_total > 0
        ? Math.round(lulaPosGain * (pool_flavio_loss / pool_total))
        : 0;
    const attr_abstention_drop =
      !flavio_grew_2t && pool_total > 0
        ? Math.round(lulaPosGain * (pool_abstention_drop / pool_total))
        : 0;
    const attr_blank_null_drop =
      !flavio_grew_2t && pool_total > 0
        ? Math.round(lulaPosGain * (pool_blank_null_drop / pool_total))
        : 0;
    const attr_third_way =
      !flavio_grew_2t && pool_total > 0
        ? Math.max(
            0,
            lulaPosGain - attr_flavio_loss - attr_abstention_drop - attr_blank_null_drop
          )
        : 0;

    const pct_flavio_loss =
      !flavio_grew_2t && lulaPosGain > 0
        ? Math.round((attr_flavio_loss / lulaPosGain) * 100)
        : 0;
    const pct_abstention_drop =
      !flavio_grew_2t && lulaPosGain > 0
        ? Math.round((attr_abstention_drop / lulaPosGain) * 100)
        : 0;
    const pct_blank_null_drop =
      !flavio_grew_2t && lulaPosGain > 0
        ? Math.round((attr_blank_null_drop / lulaPosGain) * 100)
        : 0;
    const pct_third_way =
      !flavio_grew_2t && lulaPosGain > 0
        ? Math.max(0, 100 - pct_flavio_loss - pct_abstention_drop - pct_blank_null_drop)
        : 0;

    let dominant_factor: DominantFactorKey = 'third_way';
    if (flavio_grew_2t) {
      dominant_factor = 'flavio_gain';
    } else {
      const pairs: { k: DominantFactorKey; v: number }[] = [
        { k: 'flavio_loss', v: attr_flavio_loss },
        { k: 'abstention_drop', v: attr_abstention_drop },
        { k: 'third_way', v: attr_third_way },
        { k: 'blank_null_drop', v: attr_blank_null_drop },
      ];
      pairs.sort((a, b) => b.v - a.v);
      dominant_factor = pairs[0].k;
    }

    const bairro = BAIRROS_MUNICIPIO[i % BAIRROS_MUNICIPIO.length];
    const escolaPrefix = ESCOLAS_PREFIX[i % ESCOLAS_PREFIX.length];
    const rendaLocal = Number(
      Math.max(1.2, mun.renda_sm + (i === 0 ? 1.4 : (rng() - 0.5) * 1.6)).toFixed(1)
    );
    const faixaRenda: IncomeBracketKey =
      rendaLocal <= 2.2
        ? 'ate_2sm'
        : rendaLocal <= 5.0
        ? 'de_2_a_5sm'
        : rendaLocal <= 10.0
        ? 'de_5_a_10sm'
        : 'acima_10sm';

    const zona = ((mun.ibge % 180) + 1);

    generatedSetores.push({
      id: `mun-${mun.ibge}-setor-${i + 1}`,
      codigo_local_tse: `${mun.uf}-${String(zona).padStart(3, '0')}-${mun.ibge}-${i + 1}`,
      zona_eleitoral: zona,
      nome_local: `${escolaPrefix} - ${bairro}`,
      endereco: `Rua Principal, ${100 + i * 45} - ${bairro}`,
      bairro,
      cidade: mun.nome,
      uf: mun.uf,
      regiao: mun.regiao,
      faixa_renda_ibge: faixaRenda,
      renda_media_mensal_sm: rendaLocal,
      teve_2t_governador: ['SP', 'RS', 'PE', 'BA', 'SC', 'MS', 'SE', 'AL', 'RO', 'AM', 'PA', 'PB'].includes(mun.uf),
      contexto_palanque_estadual: `Município IBGE ${mun.ibge} (${mun.nome}/${mun.uf})`,
      center: [latI, lngI],
      polygon: polygonLatLng,
      area_km2: areaKm2,
      secoes_count: secoesPerSetor,
      secao_start: 101 + i * 12,
      eleitores_aptos,
      lula_1t,
      flavio_1t,
      terceira_via_1t,
      brancos_nulos_1t,
      abstencao_1t,
      lula_2t,
      flavio_2t,
      brancos_nulos_2t,
      abstencao_2t,
      delta_lula,
      delta_flavio,
      flavio_grew_2t,
      flavio_gain_2t,
      delta_abstencao,
      pool_flavio_loss,
      pool_abstention_drop,
      pool_blank_null_drop,
      pool_third_way,
      pool_total,
      attr_flavio_loss,
      attr_abstention_drop,
      attr_blank_null_drop,
      attr_third_way,
      pct_flavio_loss,
      pct_abstention_drop,
      pct_blank_null_drop,
      pct_third_way,
      dominant_factor,
      comparativo_vizinhanca: {
        vizinhos_count: count - 1,
        media_delta_lula: Math.round(mun.delta_lula / count),
        media_attr_flavio_loss_pct: mun.pct_flavio_loss,
        media_attr_abstention_pct: mun.pct_abstention_drop,
        media_attr_third_way_pct: mun.pct_third_way,
        media_attr_blank_null_pct: mun.pct_blank_null_drop,
        destaque_ratio: 1.35,
        fator_destaque: dominant_factor,
        resumo_comparativo: flavio_grew_2t
          ? `Neste setor de ${mun.nome}/${mun.uf}, Flávio Bolsonaro cresceu +${flavio_gain_2t} votos no 2º turno ao absorver eleitores da 3ª via.`
          : `Setor Voronoi de ${areaKm2} km² em ${mun.nome}/${mun.uf} (${secoesPerSetor} urnas) com +${delta_lula} votos para Lula.`,
      },
    });
  }

  municipioVoronoiCache.set(cacheKey, generatedSetores);
  return generatedSetores;
}
