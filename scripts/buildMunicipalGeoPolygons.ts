import * as fs from 'fs';
import * as path from 'path';

type Pt = [number, number];

function polygonSignedArea(ring: Pt[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function douglasPeucker(
  pts: { lat: number; lng: number; key: string }[],
  tol: number
): { lat: number; lng: number; key: string }[] {
  if (pts.length <= 2) return pts;
  let maxD = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.lat - a.lat;
  const dy = b.lng - a.lng;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    let dSq: number;
    if (lenSq < 1e-12) {
      dSq = (p.lat - a.lat) ** 2 + (p.lng - a.lng) ** 2;
    } else {
      const t = Math.max(
        0,
        Math.min(1, ((p.lat - a.lat) * dx + (p.lng - a.lng) * dy) / lenSq)
      );
      dSq = (p.lat - (a.lat + t * dx)) ** 2 + (p.lng - (a.lng + t * dy)) ** 2;
    }
    if (dSq > maxD) {
      maxD = dSq;
      idx = i;
    }
  }

  if (Math.sqrt(maxD) > tol) {
    const left = douglasPeucker(pts.slice(0, idx + 1), tol);
    const right = douglasPeucker(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

async function main() {
  console.log('Fetching IBGE municipal polygons, state boundaries, and Ilha de Santa Catarina coastline...');

  const [munRes, stRes, ilhaRes] = await Promise.all([
    fetch('https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-100-mun.json'),
    fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson'),
    fetch(
      'https://nominatim.openstreetmap.org/search?q=Ilha+de+Santa+Catarina&format=geojson&polygon_geojson=1&polygon_threshold=0.0012',
      { headers: { 'User-Agent': 'AnatomiaVirada2026/1.0' } }
    ),
  ]);

  const munGeo = await munRes.json();
  const stGeo = await stRes.json();
  const ilhaGeo = await ilhaRes.json();

  // Exact coastline of Ilha de Santa Catarina (Florianópolis Island) + Continental Estreito/Coqueiros peninsula
  const ilhaRing: Pt[] = ilhaGeo.features[0].geometry.coordinates[0].map(
    ([lng, lat]: [number, number]) => [Number(lat.toFixed(4)), Number(lng.toFixed(4))] as Pt
  );
  // Continental Florianópolis (Estreito, Coqueiros, Capoeiras, Abraão, Balneário) bounded by the bay on the East and São José on the West
  const floripaContinenteRing: Pt[] = [
    [-27.5695, -48.6065],
    [-27.5682, -48.5915],
    [-27.5718, -48.5795],
    [-27.5815, -48.5725],
    [-27.5935, -48.5715],
    [-27.6045, -48.5735],
    [-27.6145, -48.5785],
    [-27.6165, -48.5915],
    [-27.6095, -48.6055],
    [-27.5925, -48.6085],
  ];

  // 1. Build topological vertex incidence map across all 5,564 IBGE municipalities
  const vertexToMuns = new Map<string, Set<number>>();
  const rawFeatures: {
    id: number;
    rings: { lat: number; lng: number; key: string }[][];
  }[] = [];

  for (const f of munGeo.features) {
    const id = Number(f.properties.id);
    const geom = f.geometry;
    if (!geom || !geom.coordinates) continue;

    // Extract all rings (handling both Polygon and MultiPolygon structures in tbrugz/geodata-br)
    const rawRings: [number, number][][] =
      geom.type === 'Polygon'
        ? (geom.coordinates as [number, number][][])
        : (geom.coordinates as [number, number][][][]).flatMap((p) => p);

    const parsedRings: { pts: { lat: number; lng: number; key: string }[]; area: number }[] = [];

    for (const r of rawRings) {
      if (!Array.isArray(r) || r.length < 3) continue;
      const pts: { lat: number; lng: number; key: string }[] = [];
      let prevKey = '';
      for (const c of r) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lat = Number(c[1].toFixed(4));
        const lng = Number(c[0].toFixed(4));
        const key = `${lat},${lng}`;
        if (key !== prevKey) {
          pts.push({ lat, lng, key });
          prevKey = key;
        }
      }
      if (pts.length > 2 && pts[0].key === pts[pts.length - 1].key) {
        pts.pop();
      }
      if (pts.length >= 3) {
        const area = polygonSignedArea(pts.map((p) => [p.lat, p.lng]));
        parsedRings.push({ pts, area });
      }
    }

    if (parsedRings.length === 0) continue;
    // Sort rings by area descending and keep main landmass + any major island >= 15% of main area
    parsedRings.sort((a, b) => b.area - a.area);
    const maxArea = parsedRings[0].area;
    const keptRings = parsedRings
      .filter((r, idx) => idx === 0 || (idx < 3 && r.area >= maxArea * 0.12))
      .map((r) => r.pts);

    for (const r of keptRings) {
      for (const p of r) {
        let set = vertexToMuns.get(p.key);
        if (!set) {
          set = new Set();
          vertexToMuns.set(p.key, set);
        }
        set.add(id);
      }
    }

    rawFeatures.push({ id, rings: keptRings });
  }

  const munSig = new Map<string, string>();
  for (const [k, set] of vertexToMuns.entries()) {
    munSig.set(k, Array.from(set).sort((a, b) => a - b).join('|'));
  }

  const munPolygons: Record<number, Pt[][]> = {};
  for (const f of rawFeatures) {
    if (f.id === 4205407) {
      // Use exact Ilha de Santa Catarina coastline + Continental Estreito for Florianópolis so zero water is covered!
      munPolygons[f.id] = [ilhaRing, floripaContinenteRing];
      continue;
    }

    const outRings: Pt[][] = [];
    for (const r of f.rings) {
      const n = r.length;
      const isJunction = new Array<boolean>(n).fill(false);
      for (let i = 0; i < n; i++) {
        const prevS = munSig.get(r[(i + n - 1) % n].key)!;
        const curS = munSig.get(r[i].key)!;
        const nextS = munSig.get(r[(i + 1) % n].key)!;
        if (curS.includes('|') && curS.split('|').length >= 3) {
          isJunction[i] = true;
        } else if (curS !== prevS || curS !== nextS) {
          isJunction[i] = true;
        }
      }
      const jIdxs: number[] = [];
      for (let i = 0; i < n; i++) {
        if (isJunction[i]) jIdxs.push(i);
      }
      if (jIdxs.length === 0) jIdxs.push(0, Math.floor(n / 2));
      else if (jIdxs.length === 1) jIdxs.push((jIdxs[0] + Math.floor(n / 2)) % n);

      const simpRing: Pt[] = [];
      for (let k = 0; k < jIdxs.length; k++) {
        const start = jIdxs[k];
        const end = jIdxs[(k + 1) % jIdxs.length];
        const chain: { lat: number; lng: number; key: string }[] = [];
        let cur = start;
        while (cur !== end) {
          chain.push(r[cur]);
          cur = (cur + 1) % n;
        }
        chain.push(r[end]);

        const midSig = munSig.get(chain[Math.floor(chain.length / 2)].key) || '';
        const isCoast = !midSig.includes('|');
        const tol = isCoast ? 0.0035 : 0.014;

        const forward = chain[0].key < chain[chain.length - 1].key;
        const canon = forward ? chain : [...chain].reverse();
        const simpCanon = douglasPeucker(canon, tol);
        const simpChain = forward ? simpCanon : [...simpCanon].reverse();

        for (let m = 0; m < simpChain.length - 1; m++) {
          simpRing.push([
            Number(simpChain[m].lat.toFixed(3)),
            Number(simpChain[m].lng.toFixed(3)),
          ]);
        }
      }
      if (simpRing.length >= 3) {
        outRings.push(simpRing);
      }
    }

    if (outRings.length > 0) {
      munPolygons[f.id] = outRings;
    }
  }

  // 2. Simplify 27 State Boundaries for crisp state outlines & Brazil mask
  const statePolygons: { sigla: string; nome: string; rings: Pt[][] }[] = [];
  for (const sf of stGeo.features) {
    const sigla = sf.properties.sigla;
    const nome = sf.properties.name;
    const geom = sf.geometry;
    const rawRings: [number, number][][] =
      geom.type === 'Polygon'
        ? [geom.coordinates[0]]
        : geom.coordinates.map((p: [number, number][][]) => p[0]);

    const rings: Pt[][] = [];
    for (const r of rawRings) {
      const pts = r.map(([lng, lat]: [number, number]) => ({
        lat: Number(lat.toFixed(3)),
        lng: Number(lng.toFixed(3)),
        key: '',
      }));
      const simp = douglasPeucker(pts, 0.015).map(
        (p) => [Number(p.lat.toFixed(3)), Number(p.lng.toFixed(3))] as Pt
      );
      if (simp.length >= 4) rings.push(simp);
    }
    statePolygons.push({ sigla, nome, rings });
  }

  // Save public JSON for fast macro/micro rendering
  const pubDir = path.resolve(process.cwd(), 'public/data');
  fs.mkdirSync(pubDir, { recursive: true });
  fs.writeFileSync(
    path.join(pubDir, 'brasil-geopolygons.json'),
    JSON.stringify({ municipios: munPolygons, estados: statePolygons }),
    'utf-8'
  );

  // Also export high-precision landmass polygons for the 32 precomputed capitals/hubs so generateOfflineData.ts can clip schools offline
  const PRECOMPUTED_IBGE_IDS: Record<string, number> = {
    'Sao Paulo': 3550308,
    'Rio de Janeiro': 3304557,
    'Belo Horizonte': 3106200,
    'Recife': 2611606,
    'Salvador': 2927408,
    'Porto Alegre': 4314902,
    'Curitiba': 4106902,
    'Brasilia': 5300108,
    'Fortaleza': 2304400,
    'Manaus': 1302603,
    'Belem': 1501402,
    'Goiania': 5208707,
    'Guarulhos': 3518800,
    'Campinas': 3509502,
    'Sao Bernardo do Campo': 3548708,
    'Santo Andre': 3547809,
    'Ribeirao Preto': 3543402,
    'Sao Jose dos Campos': 3549904,
    'Santos': 3548500,
    'Niteroi': 3303302,
    'Duque de Caxias': 3301702,
    'Nova Iguacu': 3303500,
    'Uberlandia': 3170206,
    'Juiz de Fora': 3136702,
    'Vitoria': 3205309,
    'Florianopolis': 4205407,
    'Joinville': 4209102,
    'Londrina': 4113700,
    'Caxias do Sul': 4305108,
    'Sao Luis': 2111300,
    'Teresina': 2211001,
    'Natal': 2408102,
    'Joao Pessoa': 2507507,
    'Maceio': 2704302,
    'Aracaju': 2800308,
    'Feira de Santana': 2910800,
    'Campo Grande': 5002704,
    'Cuiaba': 5103403,
    'Porto Velho': 1100205,
    'Palmas': 1721000,
    'Rio Branco': 1200401,
    'Macapa': 1600303,
    'Boa Vista': 1400100,
  };

  const cityLandmass: Record<string, Pt[][]> = {};
  for (const [cityId, ibge] of Object.entries(PRECOMPUTED_IBGE_IDS)) {
    if (munPolygons[ibge]) {
      cityLandmass[cityId] = munPolygons[ibge];
    }
  }

  const tsOut = `/**
 * Polígonos oficiais de massa terrestre municipal (IBGE + Linha Costeira OSM da Ilha de Santa Catarina)
 * gerados offline por scripts/buildMunicipalGeoPolygons.ts
 */
export const CITY_LANDMASS_POLYGONS: Record<string, [number, number][][]> = ${JSON.stringify(
    cityLandmass
  )};
`;
  fs.writeFileSync(
    path.resolve(process.cwd(), 'src/data/cityLandmassPolygons.ts'),
    tsOut,
    'utf-8'
  );

  console.log(
    `Saved public/data/brasil-geopolygons.json (${Object.keys(munPolygons).length} municipalities, ${statePolygons.length} states) and src/data/cityLandmassPolygons.ts`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
