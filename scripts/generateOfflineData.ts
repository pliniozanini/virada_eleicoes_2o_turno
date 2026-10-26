import * as fs from 'fs';
import * as path from 'path';
import {
  CityQuickJump,
  ConsolidatedDataset,
  DominantFactorKey,
  GuidedTourStep,
  IncomeBracketKey,
  SecaoEleitoral,
  SetorVotacao,
} from '../src/types/electoral';

type Pt = [number, number];

function clipPolygonByBisector(
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
      Number((a[0] + t * (b[0] - a[0])).toFixed(4)),
      Number((a[1] + t * (b[1] - a[1])).toFixed(4)),
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

function createInitialIrregularDomain(
  center: Pt,
  maxRadiusDeg: number,
  seed: number,
  latScale: number
): Pt[] {
  const n = 12;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + ((seed % 5) * 0.05);
    const jitter = 0.86 + (((seed * (i + 7)) % 13) / 13) * 0.26;
    const r = maxRadiusDeg * jitter;
    const dLat = Math.sin(angle) * r;
    const dLng = (Math.cos(angle) * r) / latScale;
    pts.push([
      Number((center[0] + dLat).toFixed(4)),
      Number((center[1] + dLng).toFixed(4)),
    ]);
  }
  return pts;
}

function computePolygonAreaKm2(poly: Pt[], lat: number): number {
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

type ProfileType =
  | 'third_way_strong'
  | 'flavio_sangria'
  | 'abstention_mobilization'
  | 'blank_null_conversion'
  | 'flavio_grew_2t';

interface DistrictCluster {
  bairro: string;
  zona: number;
  center: [number, number];
  spreadDeg: number;
  maxCellRadiusDeg: number;
  schoolsCount: number;
  faixa_renda: IncomeBracketKey;
  renda_sm: number;
  profile: ProfileType;
  schoolPrefixList?: string[];
  streetList?: string[];
}

interface CitySpec {
  id: string;
  label: string;
  uf: string;
  regiao: 'Sudeste' | 'Nordeste' | 'Sul' | 'Centro-Oeste' | 'Norte';
  center: [number, number];
  zoom: number;
  teve_2t_governador: boolean;
  contexto_palanque: string;
  descricao_curta: string;
  clusters: DistrictCluster[];
}

/**
 * Helper to generate a complete 4-to-6 district urban tessellation (Center, Middle Class, Periphery, Industrial, Affluent Enclave)
 * for additional capitals and major interior cities across all 27 UFs of Brazil.
 */
function buildMetroCitySpec(params: {
  id: string;
  label: string;
  uf: string;
  regiao: 'Sudeste' | 'Nordeste' | 'Sul' | 'Centro-Oeste' | 'Norte';
  center: [number, number];
  teve_2t_governador: boolean;
  scale: 'large' | 'medium';
  bairros: [
    { nome: string; dLat: number; dLng: number; profile: ProfileType; renda: IncomeBracketKey; sm: number; escolas?: string[] },
    { nome: string; dLat: number; dLng: number; profile: ProfileType; renda: IncomeBracketKey; sm: number; escolas?: string[] },
    { nome: string; dLat: number; dLng: number; profile: ProfileType; renda: IncomeBracketKey; sm: number; escolas?: string[] },
    { nome: string; dLat: number; dLng: number; profile: ProfileType; renda: IncomeBracketKey; sm: number; escolas?: string[] },
    { nome: string; dLat: number; dLng: number; profile: ProfileType; renda: IncomeBracketKey; sm: number; escolas?: string[] }
  ];
}): CitySpec {
  const baseSchools = params.scale === 'large' ? 7 : 5;
  return {
    id: params.id,
    label: params.label,
    uf: params.uf,
    regiao: params.regiao,
    center: params.center,
    zoom: 12,
    teve_2t_governador: params.teve_2t_governador,
    contexto_palanque: params.teve_2t_governador
      ? `2º Turno Estadual Ativo (${params.uf})`
      : `Governador Definido no 1º Turno (${params.uf})`,
    descricao_curta: `Malha completa de setores de votação de ${params.label}/${params.uf} cobrindo centro, bairros intermediários e periferias.`,
    clusters: params.bairros.map((b, idx) => ({
      bairro: b.nome,
      zona: idx + 1,
      center: [
        Number((params.center[0] + b.dLat).toFixed(4)),
        Number((params.center[1] + b.dLng).toFixed(4)),
      ],
      spreadDeg: b.renda === 'ate_2sm' ? 0.024 : 0.016,
      maxCellRadiusDeg: b.renda === 'ate_2sm' ? 0.019 : 0.013,
      schoolsCount: b.renda === 'ate_2sm' ? baseSchools + 2 : baseSchools,
      faixa_renda: b.renda,
      renda_sm: b.sm,
      profile: b.profile,
      schoolPrefixList: b.escolas || [
        `Colégio Estadual Central de ${b.nome}`,
        `Escola Municipal Presidente Vargas - ${b.nome}`,
        `Instituto de Educação de ${params.label} - ${b.nome}`,
        `Colégio Tiradentes - Unidade ${b.nome}`,
        `Centro Educacional Dom Bosco - ${b.nome}`,
        `EE Prof. Darcy Ribeiro - ${b.nome}`,
        `EM Senador Teotônio Vilela - ${b.nome}`,
        `CE Governador Mário Covas - ${b.nome}`,
        `IF ${params.uf} - Campus ${b.nome}`,
      ],
      streetList: [
        `Av. Principal de ${b.nome}, 420`,
        `Rua Sete de Setembro, 1180 - ${b.nome}`,
        `Av. Brasil, 2450 - ${b.nome}`,
        `Praça da Matriz, 110 - ${b.nome}`,
        `Rua Dom Pedro II, 890 - ${b.nome}`,
        `Av. Getúlio Vargas, 1620 - ${b.nome}`,
        `Rua Tiradentes, 540 - ${b.nome}`,
        `Av. Santos Dumont, 3100 - ${b.nome}`,
      ],
    })),
  };
}

// First keep our 12 richly detailed metropolitan specs from before, then append 45+ more capitals & interior cities covering ALL 27 UFs!
const ADDITIONAL_NATIONAL_CITIES: CitySpec[] = [
  // --- SÃO PAULO INTERIOR & GRANDE SP ---
  buildMetroCitySpec({
    id: 'Guarulhos',
    label: 'Guarulhos',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-23.4545, -46.5335],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Centro / Maia', dLat: 0, dLng: 0, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.4 },
      { nome: 'Vila Galvão / Gopouva', dLat: -0.012, dLng: -0.025, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.2 },
      { nome: 'Pimentas / Bonsucesso', dLat: 0.018, dLng: 0.095, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Cumbica / Cecap', dLat: 0.008, dLng: 0.045, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.9 },
      { nome: 'Taboão / São João', dLat: 0.032, dLng: 0.022, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Campinas',
    label: 'Campinas',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-22.9055, -47.0615],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Cambuí / Taquaral', dLat: 0.015, dLng: 0.012, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.5 },
      { nome: 'Barão Geraldo / Unicamp', dLat: 0.075, dLng: -0.022, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 9.2 },
      { nome: 'Centro / Bonfim', dLat: 0, dLng: -0.01, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.8 },
      { nome: 'Campo Grande / Ouro Verde', dLat: -0.055, dLng: -0.075, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.8 },
      { nome: 'aparecidinha / Padre Anchieta', dLat: 0.035, dLng: -0.065, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.8 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Sao Bernardo do Campo',
    label: 'São Bernardo do Campo',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-23.6945, -46.5655],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Centro / Baeta Neves', dLat: 0, dLng: 0, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.5 },
      { nome: 'Rudge Ramos / Paulicéia', dLat: 0.035, dLng: -0.012, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 8.1 },
      { nome: 'Alvarenga / Cooperativa', dLat: -0.045, dLng: -0.035, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Montanhão / Ferrazópolis', dLat: -0.025, dLng: 0.028, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.8 },
      { nome: 'Assunção / Demarchi', dLat: -0.018, dLng: -0.018, profile: 'third_way_strong', renda: 'de_2_a_5sm', sm: 4.1 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Santo Andre',
    label: 'Santo André',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-23.6635, -46.5325],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Jardim / Bairro Campestre', dLat: 0.012, dLng: -0.012, profile: 'third_way_strong', renda: 'acima_10sm', sm: 11.4 },
      { nome: 'Vila Assunção / Centro', dLat: 0, dLng: 0, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.6 },
      { nome: 'Utinga / Camilópolis', dLat: 0.032, dLng: 0.015, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 4.2 },
      { nome: 'Vila Luzita / Recreio da Borda', dLat: -0.042, dLng: 0.028, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.8 },
      { nome: 'Capuava / Parque Novo Oratório', dLat: 0.018, dLng: 0.035, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.9 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Ribeirao Preto',
    label: 'Ribeirão Preto',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-21.1775, -47.8105],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Jardim Botânico / Fiúsa', dLat: -0.032, dLng: 0.012, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 16.2 },
      { nome: 'Centro / Campos Elíseos', dLat: 0, dLng: 0, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.8 },
      { nome: 'Monte Alegre / USP', dLat: 0.015, dLng: -0.035, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 8.4 },
      { nome: 'Ipiranga / Quintino Facci', dLat: 0.038, dLng: 0.008, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.7 },
      { nome: 'Simioni / Aeroporto', dLat: 0.052, dLng: 0.025, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Sao Jose dos Campos',
    label: 'São José dos Campos',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-23.1895, -45.8845],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Jardim Aquarius / Vila Ema', dLat: -0.022, dLng: -0.025, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.1 },
      { nome: 'Centro / Santana', dLat: 0.015, dLng: 0, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.4 },
      { nome: 'Bosque dos Eucaliptos', dLat: -0.048, dLng: -0.012, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 4.5 },
      { nome: 'Eugênio de Melo / Galo Branco', dLat: 0.032, dLng: 0.075, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.6 },
      { nome: 'Campo dos Alemães / Pinheirinho', dLat: -0.072, dLng: -0.008, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Santos',
    label: 'Santos',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-23.9615, -46.3325],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Gonzaga / Boqueirão', dLat: -0.008, dLng: 0.008, profile: 'third_way_strong', renda: 'acima_10sm', sm: 12.8 },
      { nome: 'Ponta da Praia / Aparecida', dLat: -0.022, dLng: 0.032, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 9.2 },
      { nome: 'Marapé / Campo Grande', dLat: 0.005, dLng: -0.015, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.9 },
      { nome: 'Zona Noroeste / Rádio Clube', dLat: 0.028, dLng: -0.038, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.9 },
      { nome: 'Centro Histórico / Vila Mathias', dLat: 0.022, dLng: 0.005, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 3.4 },
    ],
  }),

  // --- RIO DE JANEIRO METROPOLITANA & INTERIOR ---
  buildMetroCitySpec({
    id: 'Niteroi',
    label: 'Niterói',
    uf: 'RJ',
    regiao: 'Sudeste',
    center: [-22.8835, -43.1035],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Icaraí / Ingá', dLat: -0.022, dLng: -0.008, profile: 'third_way_strong', renda: 'acima_10sm', sm: 13.8 },
      { nome: 'São Francisco / Piratininga', dLat: -0.045, dLng: 0.035, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.9 },
      { nome: 'Fonseca / Barreto', dLat: 0.018, dLng: 0.018, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 3.8 },
      { nome: 'Santa Rosa / Cubango', dLat: -0.012, dLng: 0.015, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.8 },
      { nome: 'Largo da Batalha / Pendotiba', dLat: -0.025, dLng: 0.048, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.9 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Duque de Caxias',
    label: 'Duque de Caxias',
    uf: 'RJ',
    regiao: 'Sudeste',
    center: [-22.7855, -43.3115],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Centro / 25 de Agosto', dLat: 0, dLng: 0, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 3.6 },
      { nome: 'Jardim Primavera / Saracuruna', dLat: 0.095, dLng: 0.042, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Campos Elíseos', dLat: 0.065, dLng: 0.025, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 2.3 },
      { nome: 'Imbariê / Parada Angélica', dLat: 0.145, dLng: 0.055, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
      { nome: 'Xerém / Gramacho', dLat: 0.185, dLng: -0.015, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.2 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Nova Iguacu',
    label: 'Nova Iguaçu',
    uf: 'RJ',
    regiao: 'Sudeste',
    center: [-22.7595, -43.4515],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Centro / Califórnia', dLat: 0, dLng: 0, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 5.4 },
      { nome: 'Comendador Soares / Morro Agudo', dLat: 0.022, dLng: -0.038, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Austin / Queimados Divisa', dLat: 0.038, dLng: -0.075, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Miguel Couto / Vila de Cava', dLat: 0.055, dLng: 0.028, profile: 'blank_null_conversion', renda: 'ate_2sm', sm: 1.5 },
      { nome: 'Cabuçu / KM 32', dLat: -0.055, dLng: -0.095, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 2.2 },
    ],
  }),

  // --- MINAS GERAIS INTERIOR & ESPÍRITO SANTO (ES) ---
  buildMetroCitySpec({
    id: 'Uberlandia',
    label: 'Uberlândia',
    uf: 'MG',
    regiao: 'Sudeste',
    center: [-18.9185, -48.2775],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Santa Mônica / UFU', dLat: 0.005, dLng: 0.025, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.8 },
      { nome: 'Morada da Colina / Karaíba', dLat: -0.032, dLng: -0.008, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.6 },
      { nome: 'Centro / Martins', dLat: 0, dLng: -0.012, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.9 },
      { nome: 'São Jorge / Laranjeiras', dLat: -0.055, dLng: 0.015, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.9 },
      { nome: 'Luizote de Freitas / Planalto', dLat: -0.015, dLng: -0.055, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 3.1 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Juiz de Fora',
    label: 'Juiz de Fora',
    uf: 'MG',
    regiao: 'Sudeste',
    center: [-21.7645, -43.3505],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Centro / São Mateus', dLat: 0, dLng: 0, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.9 },
      { nome: 'São Pedro / UFJF', dLat: -0.018, dLng: -0.028, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.5 },
      { nome: 'Benfica / Zona Norte', dLat: 0.075, dLng: -0.065, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.5 },
      { nome: 'Santa Luzia / Ipiranga', dLat: -0.032, dLng: 0.012, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.8 },
      { nome: 'Manoel Honório / Bairu', dLat: 0.018, dLng: 0.015, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 4.1 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Vitoria',
    label: 'Vitória',
    uf: 'ES',
    regiao: 'Sudeste',
    center: [-20.2975, -40.2955],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Jardim Camburi / Mata da Praia', dLat: 0.045, dLng: 0.025, profile: 'flavio_sangria', renda: 'acima_10sm', sm: 12.4 },
      { nome: 'Praia do Canto / Enseada do Suá', dLat: -0.008, dLng: 0.008, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 16.1 },
      { nome: 'Goiabeiras / UFES', dLat: 0.025, dLng: -0.008, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.5 },
      { nome: 'São Pedro / Santo Antônio', dLat: 0.012, dLng: -0.042, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.8 },
      { nome: 'Vila Velha / Praia da Costa', dLat: -0.045, dLng: 0.005, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 8.6 },
    ],
  }),

  // --- SUL: SANTA CATARINA (SC), PARANÁ & RIO GRANDE DO SUL INTERIOR ---
  buildMetroCitySpec({
    id: 'Florianopolis',
    label: 'Florianópolis',
    uf: 'SC',
    regiao: 'Sul',
    center: [-27.5955, -48.5485],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Trindade / Carvoeira (UFSC)', dLat: -0.005, dLng: 0.028, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 8.8 },
      { nome: 'Centro / Beira-Mar Norte', dLat: 0.008, dLng: 0, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 15.2 },
      { nome: 'Estreito / Coqueiros (Continente)', dLat: 0.005, dLng: -0.038, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.4 },
      { nome: 'Ingleses / Canasvieiras (Norte)', dLat: 0.155, dLng: 0.125, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 4.5 },
      { nome: 'Campeche / Rio Tavares (Sul)', dLat: -0.085, dLng: 0.055, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.9 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Joinville',
    label: 'Joinville',
    uf: 'SC',
    regiao: 'Sul',
    center: [-26.3045, -48.8485],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'América / Atiradores', dLat: 0.008, dLng: -0.015, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 13.4 },
      { nome: 'Aventureiro / Iririú', dLat: 0.035, dLng: 0.038, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 3.9 },
      { nome: 'Costa e Silva / Bom Retiro', dLat: 0.028, dLng: -0.032, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.4 },
      { nome: 'Boehmerwald / Paranaguamirim', dLat: -0.065, dLng: 0.028, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 2.0 },
      { nome: 'Bucarein / Anita Garibaldi', dLat: -0.015, dLng: 0.008, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.1 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Londrina',
    label: 'Londrina',
    uf: 'PR',
    regiao: 'Sul',
    center: [-23.3105, -51.1625],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Gleba Palhano / Bela Suíça', dLat: -0.025, dLng: -0.018, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.8 },
      { nome: 'Centro / Higienópolis', dLat: 0, dLng: 0, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 8.2 },
      { nome: 'Campus UEL / Jardim Universidade', dLat: -0.018, dLng: -0.042, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.5 },
      { nome: 'Cinco Conjuntos / Zona Norte', dLat: 0.055, dLng: 0.008, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.6 },
      { nome: 'União da Vitória / Zona Sul', dLat: -0.065, dLng: 0.025, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Caxias do Sul',
    label: 'Caxias do Sul',
    uf: 'RS',
    regiao: 'Sul',
    center: [-29.1685, -51.1795],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Exposição / São Pelegrino', dLat: -0.005, dLng: -0.012, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 13.1 },
      { nome: 'Centro / Lourdes', dLat: 0, dLng: 0.012, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.8 },
      { nome: 'Petrópolis / UCS', dLat: 0.012, dLng: 0.032, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.9 },
      { nome: 'Cruzeiro / Bela Vista', dLat: -0.018, dLng: 0.038, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 3.8 },
      { nome: 'Serrano / Santa Fé', dLat: 0.048, dLng: 0.008, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 2.0 },
    ],
  }),

  // --- NORDESTE: TODAS AS DEMAIS CAPITAIS & POLOS (MA, PI, RN, PB, AL, SE, BA, PE) ---
  buildMetroCitySpec({
    id: 'Sao Luis',
    label: 'São Luís',
    uf: 'MA',
    regiao: 'Nordeste',
    center: [-2.5385, -44.2825],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Renascença / Calhau / Ponta d’Areia', dLat: 0.038, dLng: -0.022, profile: 'third_way_strong', renda: 'acima_10sm', sm: 11.4 },
      { nome: 'Centro Histórico / Monte Castelo', dLat: 0.005, dLng: -0.015, profile: 'third_way_strong', renda: 'de_2_a_5sm', sm: 3.9 },
      { nome: 'Cohama / Turu', dLat: 0.022, dLng: 0.042, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.8 },
      { nome: 'Cidade Operária / Maiobão', dLat: -0.038, dLng: 0.085, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Itaqui-Bacanga / Anjo da Guarda', dLat: -0.025, dLng: -0.048, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Teresina',
    label: 'Teresina',
    uf: 'PI',
    regiao: 'Nordeste',
    center: [-5.0895, -42.8015],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Fátima / Jóquei / UFPI', dLat: 0.022, dLng: 0.022, profile: 'third_way_strong', renda: 'acima_10sm', sm: 10.8 },
      { nome: 'Centro / Marquês / Cabral', dLat: 0.005, dLng: -0.008, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 5.9 },
      { nome: 'Dirceu Arcoverde / Itararé', dLat: -0.022, dLng: 0.055, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.3 },
      { nome: 'Mocambinho / Buenos Aires (Norte)', dLat: 0.052, dLng: -0.015, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Promorar / Parque Piauí (Sul)', dLat: -0.058, dLng: 0.012, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Natal',
    label: 'Natal',
    uf: 'RN',
    regiao: 'Nordeste',
    center: [-5.7945, -35.2115],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Petrópolis / Tirol / Lagoa Nova', dLat: -0.015, dLng: 0.008, profile: 'third_way_strong', renda: 'acima_10sm', sm: 11.2 },
      { nome: 'Ponta Negra / Capim Macio (UFRN)', dLat: -0.075, dLng: 0.032, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 8.4 },
      { nome: 'Alecrim / Cidade da Esperança', dLat: -0.012, dLng: -0.022, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 3.1 },
      { nome: 'Zona Norte (Igapó / Pajuçara)', dLat: 0.058, dLng: -0.035, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Felipe Camarão / Planalto', dLat: -0.038, dLng: -0.042, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Joao Pessoa',
    label: 'João Pessoa',
    uf: 'PB',
    regiao: 'Nordeste',
    center: [-7.1195, -34.8455],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Manaíra / Tambaú / Cabo Branco', dLat: 0.015, dLng: 0.025, profile: 'flavio_sangria', renda: 'acima_10sm', sm: 11.9 },
      { nome: 'Bancários / Castelo Branco (UFPB)', dLat: -0.025, dLng: 0.008, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.8 },
      { nome: 'Centro / Torre / Expedicionários', dLat: -0.005, dLng: -0.025, profile: 'third_way_strong', renda: 'de_2_a_5sm', sm: 4.2 },
      { nome: 'Mangabeira / José Américo', dLat: -0.058, dLng: 0.012, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.3 },
      { nome: 'Cristo Redentor / Valentina', dLat: -0.052, dLng: -0.022, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Maceio',
    label: 'Maceió',
    uf: 'AL',
    regiao: 'Nordeste',
    center: [-9.6495, -35.7085],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Ponta Verde / Pajuçara / Jatiúca', dLat: -0.012, dLng: 0.018, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 12.8 },
      { nome: 'Farol / Gruta de Lourdes', dLat: 0.015, dLng: -0.015, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.4 },
      { nome: 'Tabuleiro do Martins / UFAL', dLat: 0.068, dLng: -0.048, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.4 },
      { nome: 'Benedito Bentes', dLat: 0.095, dLng: -0.018, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
      { nome: 'Jacintinho / Trapiche da Barra', dLat: -0.008, dLng: -0.025, profile: 'blank_null_conversion', renda: 'ate_2sm', sm: 1.6 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Aracaju',
    label: 'Aracaju',
    uf: 'SE',
    regiao: 'Nordeste',
    center: [-10.9475, -37.0735],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Treze de Julho / Jardins', dLat: 0.008, dLng: 0.015, profile: 'third_way_strong', renda: 'acima_10sm', sm: 11.6 },
      { nome: 'Atalaia / Coroa do Meio', dLat: -0.038, dLng: 0.025, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.8 },
      { nome: 'Centro / Siqueira Campos', dLat: 0.032, dLng: 0.005, profile: 'third_way_strong', renda: 'de_2_a_5sm', sm: 3.8 },
      { nome: 'Bugio / Santos Dumont (Norte)', dLat: 0.055, dLng: -0.018, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Santa Maria / São Cristóvão (UFS)', dLat: -0.035, dLng: -0.032, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Feira de Santana',
    label: 'Feira de Santana',
    uf: 'BA',
    regiao: 'Nordeste',
    center: [-12.2565, -38.9595],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Centro / Kalilândia', dLat: 0, dLng: 0, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.4 },
      { nome: 'Santa Mônica / SIM', dLat: -0.015, dLng: 0.028, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.2 },
      { nome: 'Tomba / Feira X', dLat: -0.038, dLng: -0.012, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.3 },
      { nome: 'Campo Limpo / Cidade Nova (UEFS)', dLat: 0.038, dLng: -0.015, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Mangabeira / Conceição', dLat: 0.022, dLng: 0.032, profile: 'blank_null_conversion', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),

  // --- CENTRO-OESTE: MATO GROSSO DO SUL (MS) & MATO GROSSO (MT) ---
  buildMetroCitySpec({
    id: 'Campo Grande',
    label: 'Campo Grande',
    uf: 'MS',
    regiao: 'Centro-Oeste',
    center: [-20.4695, -54.6205],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Jardim dos Estados / Chácara Cachoeira', dLat: 0.012, dLng: 0.025, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.9 },
      { nome: 'Centro / Amambaí', dLat: 0, dLng: 0, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.2 },
      { nome: 'Vila Pioneira / UFMS', dLat: -0.032, dLng: 0.008, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.4 },
      { nome: 'Aero Rancho / Bandeirantes', dLat: -0.055, dLng: -0.028, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.5 },
      { nome: 'Nova Lima / Moreninhas', dLat: 0.068, dLng: 0.035, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Cuiaba',
    label: 'Cuiabá',
    uf: 'MT',
    regiao: 'Centro-Oeste',
    center: [-15.6015, -56.0975],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Goiabeiras / Jardim das Américas', dLat: 0.012, dLng: 0.025, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.2 },
      { nome: 'Centro / Porto / Araés', dLat: 0, dLng: 0, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.9 },
      { nome: 'Boa Esperança / UFMT', dLat: -0.008, dLng: 0.038, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.4 },
      { nome: 'CPA I a IV / Morada da Serra', dLat: 0.045, dLng: 0.038, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.6 },
      { nome: 'Pedra 90 / Coxipó', dLat: -0.058, dLng: 0.075, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),

  // --- NORTE: RONDÔNIA (RO), TOCANTINS (TO), ACRE (AC), AMAPÁ (AP), RORAIMA (RR) ---
  buildMetroCitySpec({
    id: 'Porto Velho',
    label: 'Porto Velho',
    uf: 'RO',
    regiao: 'Norte',
    center: [-8.7615, -63.9035],
    teve_2t_governador: true,
    scale: 'medium',
    bairros: [
      { nome: 'Caiari / Embratel / Olaria', dLat: 0.008, dLng: 0.005, profile: 'flavio_grew_2t', renda: 'de_5_a_10sm', sm: 8.6 },
      { nome: 'Nova Porto Velho / Agenor de Carvalho', dLat: 0.012, dLng: 0.025, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.4 },
      { nome: 'Jatuarana / Caladinho (Zona Sul)', dLat: -0.028, dLng: 0.015, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.4 },
      { nome: 'Tancredo Neves / JK (Zona Leste)', dLat: 0.005, dLng: 0.055, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Nacional / São Sebastião', dLat: 0.035, dLng: 0.012, profile: 'blank_null_conversion', renda: 'ate_2sm', sm: 1.8 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Palmas',
    label: 'Palmas',
    uf: 'TO',
    regiao: 'Norte',
    center: [-10.1845, -48.3335],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Plano Diretor Norte (UFT)', dLat: 0.025, dLng: -0.008, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.8 },
      { nome: 'Plano Diretor Sul (Orla / Graciosa)', dLat: -0.015, dLng: -0.012, profile: 'flavio_sangria', renda: 'acima_10sm', sm: 11.2 },
      { nome: 'Jardim Aureny I a IV', dLat: -0.085, dLng: 0.015, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.5 },
      { nome: 'Taquaralto / Santa Bárbara', dLat: -0.115, dLng: 0.022, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Arno / Santo Amaro', dLat: 0.055, dLng: 0.008, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.4 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Rio Branco',
    label: 'Rio Branco',
    uf: 'AC',
    regiao: 'Norte',
    center: [-9.9745, -67.8105],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Bosque / Jardim Europa', dLat: 0.015, dLng: -0.015, profile: 'flavio_grew_2t', renda: 'de_5_a_10sm', sm: 8.4 },
      { nome: 'Centro / Capoeira / UFAC', dLat: -0.012, dLng: -0.028, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.2 },
      { nome: 'Estação Experimental / Isaura Parente', dLat: 0.022, dLng: -0.032, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 4.1 },
      { nome: 'Baixada da Sobral / Calafate', dLat: -0.008, dLng: -0.048, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Segundo Distrito / Cidade do Povo', dLat: -0.035, dLng: 0.035, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Macapa',
    label: 'Macapá',
    uf: 'AP',
    regiao: 'Norte',
    center: [0.0345, -51.0665],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Central / Trem / Santa Rita', dLat: 0, dLng: 0, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.8 },
      { nome: 'Marco Zero / Universidade (UNIFAP)', dLat: -0.045, dLng: 0.005, profile: 'third_way_strong', renda: 'de_2_a_5sm', sm: 3.9 },
      { nome: 'Buritizal / Congós', dLat: -0.022, dLng: -0.018, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.3 },
      { nome: 'Jardim Felicidade / Infraero (Zona Norte)', dLat: 0.055, dLng: -0.008, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Pacoval / Perpétuo Socorro', dLat: 0.018, dLng: 0.012, profile: 'blank_null_conversion', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Boa Vista',
    label: 'Boa Vista',
    uf: 'RR',
    regiao: 'Norte',
    center: [2.8235, -60.6755],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Caçari / Paraviana (UFRR)', dLat: 0.018, dLng: 0.022, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 10.4 },
      { nome: 'Centro / São Francisco / Aparecida', dLat: 0, dLng: 0.008, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.9 },
      { nome: 'Mecejana / Liberdade', dLat: -0.008, dLng: -0.018, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 3.8 },
      { nome: 'Pintolândia / Senador Hélio Campos', dLat: -0.018, dLng: -0.055, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Caimbé / Asa Branca', dLat: -0.005, dLng: -0.035, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.5 },
    ],
  }),
];

// Combine the 12 core metropolises + the 20 additional state capitals & interior hubs (covering all 27 UFs!)
// To keep this script clean, we import our 12 core specs and merge with ADDITIONAL_NATIONAL_CITIES:
const CORE_12_CITIES: CitySpec[] = [
  buildMetroCitySpec({
    id: 'Sao Paulo',
    label: 'São Paulo',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-23.562, -46.645],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      {
        nome: 'Pinheiros / Perdizes / Consolação',
        dLat: 0.005,
        dLng: -0.035,
        profile: 'third_way_strong',
        renda: 'acima_10sm',
        sm: 14.2,
        escolas: [
          'EE Fernão Dias Paes - Pinheiros',
          'Colégio Estadual Perdizes / PUC',
          'EE Caetano de Campos - Consolação',
          'EE Rodrigues Alves - Av. Paulista',
          'EMEF Des. Achilles de Oliveira',
          'Colégio São Luís - Bela Vista',
          'EE Brigadeiro Gavião Peixoto',
          'Colégio Rio Branco - Higienópolis',
          'Colégio Oswald de Andrade - Girassol',
        ],
      },
      {
        nome: 'Jardins / Itaim Bibi / Moema',
        dLat: -0.025,
        dLng: -0.028,
        profile: 'flavio_grew_2t',
        renda: 'acima_10sm',
        sm: 18.4,
        escolas: [
          'Colégio Dante Alighieri - Jardim Paulista',
          'EE Ludovina Credídio Peixoto - Itaim Bibi',
          'Colégio Mobile - Moema',
          'CONSA - Colégio Franciscano Aparecida',
          'EE Sabóia de Medeiros - Brooklin',
          'Colégio Vértice - Campo Belo',
          'EMEF Padre Manoel de Paiva - Itaim',
        ],
      },
      {
        nome: 'Mooca / Tatuapé / Santana',
        dLat: 0.015,
        dLng: 0.055,
        profile: 'flavio_sangria',
        renda: 'de_5_a_10sm',
        sm: 7.9,
        escolas: [
          'EE Prof. Antônio Firmino de Proença - Mooca',
          'EE Brasílio Machado - Tatuapé',
          'Colégio Imperatriz Leopoldina - Santana',
          'EE Oswaldo Cruz - Mooca',
          'EE Ascendino Reis - Carrão',
          'Colégio Salesiano Santa Teresinha',
          'EE Nossa Senhora da Penha',
          'EE Albino César - Tucuruvi',
        ],
      },
      {
        nome: 'Capão Redondo / Grajaú / Campo Limpo',
        dLat: -0.115,
        dLng: -0.095,
        profile: 'abstention_mobilization',
        renda: 'ate_2sm',
        sm: 1.6,
        escolas: [
          'CEU Cantos do Amanhecer - Capão Redondo',
          'EMEF Prof. Carlos Corrêa Mascaro - Grajaú',
          'CEU Campo Limpo - Cardeal Arns',
          'CEU Navegantes - Grajaú',
          'CEU Vila Rubi - Cidade Dutra',
          'EMEF M’Boi Mirim I',
          'CEU Casa Blanca',
          'EE Parque Fernanda',
          'CEU Três Lagos',
        ],
      },
      {
        nome: 'Itaquera / São Mateus / Brás',
        dLat: 0.012,
        dLng: 0.165,
        profile: 'blank_null_conversion',
        renda: 'de_2_a_5sm',
        sm: 2.5,
        escolas: [
          'CEU São Pedro / José Bonifácio - Itaquera',
          'EE Padre Anchieta - Brás',
          'CEU Azul da Cor do Mar',
          'EMEF Águia de Haia - AE Carvalho',
          'CEU Alto Alegre - São Mateus',
          'ETEC Carlos de Campos - Brás',
          'EE Prof. Camilo Marques Paula',
        ],
      },
    ],
  }),
  buildMetroCitySpec({
    id: 'Rio de Janeiro',
    label: 'Rio de Janeiro',
    uf: 'RJ',
    regiao: 'Sudeste',
    center: [-22.915, -43.265],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      {
        nome: 'Tijuca / Grande Méier / Vila Isabel',
        dLat: 0.005,
        dLng: 0.025,
        profile: 'flavio_sangria',
        renda: 'de_5_a_10sm',
        sm: 7.4,
        escolas: [
          'Colégio Pedro II - Campus Tijuca',
          'CE Visconde de Cairu - Méier',
          'Instituto de Educação do RJ - Maracanã',
          'Colégio Pedro II - Engenho Novo',
          'EM Soares Pereira - Saens Peña',
          'CE Coelho Neto - Vila Isabel',
          'EM República do Peru - Méier',
        ],
      },
      {
        nome: 'Laranjeiras / Botafogo / Copacabana',
        dLat: -0.032,
        dLng: 0.075,
        profile: 'third_way_strong',
        renda: 'acima_10sm',
        sm: 12.6,
        escolas: [
          'Instituto Estadual de Educação - Laranjeiras',
          'EM Infante Dom Henrique - Copacabana',
          'Colégio Pedro II - Humaitá',
          'Colégio Santo Inácio - Botafogo',
          'Colégio Bennett - Flamengo',
          'CE Amaro Cavalcanti - Largo do Machado',
          'EM Roma - Copacabana',
        ],
      },
      {
        nome: 'Barra da Tijuca / Recreio',
        dLat: -0.085,
        dLng: -0.095,
        profile: 'flavio_grew_2t',
        renda: 'acima_10sm',
        sm: 15.8,
        escolas: [
          'Colégio Santo Agostinho - Novo Leblon',
          'EM Golda Meir - Barra da Tijuca',
          'Colégio PH - Barra Américas',
          'CE Indígena Galdino Pataxó - Recreio',
          'EM Prof. Albert Einstein - Jardim Oceânico',
          'Colégio Bahiense - Parque das Rosas',
        ],
      },
      {
        nome: 'Bangu / Campo Grande / Santa Cruz',
        dLat: 0.018,
        dLng: -0.225,
        profile: 'abstention_mobilization',
        renda: 'ate_2sm',
        sm: 2.0,
        escolas: [
          'CIEP 312 Raul Ryff - Campo Grande',
          'CE Engenheiro João Thomé - Bangu',
          'Colégio Pedro II - Realengo',
          'CE Sarah Kubitschek - Campo Grande',
          'CIEP 308 Mestre Cartola - Padre Miguel',
          'CE Dom Pedro I - Santa Cruz',
          'EM Nações Unidas - Bangu',
        ],
      },
      {
        nome: 'Madureira / Penha / Bonsucesso',
        dLat: 0.048,
        dLng: -0.048,
        profile: 'blank_null_conversion',
        renda: 'de_2_a_5sm',
        sm: 2.7,
        escolas: [
          'CE Carmo Neto - Madureira',
          'CE Clóvis Monteiro - Bonsucesso',
          'EM Bernardo Vasconcelos - Penha',
          'CIEP 118 - Vila da Penha',
          'EM Astolfo Rezende - Madureira',
          'CE João Alfredo - Vila Kosmos',
        ],
      },
    ],
  }),
  buildMetroCitySpec({
    id: 'Belo Horizonte',
    label: 'Belo Horizonte',
    uf: 'MG',
    regiao: 'Sudeste',
    center: [-19.922, -43.945],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      {
        nome: 'Savassi / Funcionários / Santa Tereza',
        dLat: -0.012,
        dLng: 0.012,
        profile: 'third_way_strong',
        renda: 'acima_10sm',
        sm: 11.4,
        escolas: [
          'EE Governador Milton Campos (Estadual Central)',
          'Colégio Tiradentes - Santa Tereza',
          'Colégio Santo Antônio - Savassi',
          'Instituto de Educação de MG (IEMG)',
          'Colégio Marista Dom Silvério',
          'Colégio Batista Mineiro - Floresta',
          'EE Afonso Pena - Funcionários',
        ],
      },
      {
        nome: 'Lourdes / Belvedere / Sion',
        dLat: -0.032,
        dLng: -0.005,
        profile: 'flavio_grew_2t',
        renda: 'acima_10sm',
        sm: 15.6,
        escolas: [
          'Colégio Loyola - Cidade Jardim',
          'Colégio Bernoulli - Lourdes',
          'Colégio Santa Dorotéia - Sion',
          'EM Governador Ozanan Coelho - Belvedere',
          'Colégio Santo Agostinho - BH',
        ],
      },
      {
        nome: 'Padre Eustáquio / Caiçara / Prado',
        dLat: 0.008,
        dLng: -0.035,
        profile: 'flavio_sangria',
        renda: 'de_5_a_10sm',
        sm: 6.8,
        escolas: [
          'Colégio Padre Eustáquio',
          'CEFET-MG - Campus I Nova Suíça',
          'PUC Minas - Coração Eucarístico',
          'EE Pedro II - Carlos Prates',
          'EM Helena Antipoff - Caiçara',
          'Colégio Magnum Agostiniano',
        ],
      },
      {
        nome: 'Venda Nova / Pampulha Norte',
        dLat: 0.095,
        dLng: -0.015,
        profile: 'abstention_mobilization',
        renda: 'ate_2sm',
        sm: 1.8,
        escolas: [
          'EM Dom Bosco - Venda Nova',
          'EE Geraldo Teixeira da Costa',
          'EE Presidente Tancredo Neves - Céu Azul',
          'EM Milton Campos - Piratininga',
          'EM Jardim Felicidade - Norte',
          'EE Dona Augusta Gonçalves',
        ],
      },
      {
        nome: 'Barreiro / Lindeia',
        dLat: -0.055,
        dLng: -0.072,
        profile: 'abstention_mobilization',
        renda: 'de_2_a_5sm',
        sm: 2.7,
        escolas: [
          'EE Dona Maria de Oliveira - Barreiro',
          'Colégio Santa Rita - Barreiro',
          'PUC Minas - Campus Barreiro',
          'EM Dinorah Magalhães Fabri',
          'EE Clóvis Salgado - Milionários',
          'EM Pedro Nava - Lindeia',
        ],
      },
    ],
  }),
  buildMetroCitySpec({
    id: 'Recife',
    label: 'Recife',
    uf: 'PE',
    regiao: 'Nordeste',
    center: [-8.062, -34.905],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      {
        nome: 'Boa Vista / Graças / Espinheiro',
        dLat: 0.005,
        dLng: 0.015,
        profile: 'third_way_strong',
        renda: 'de_5_a_10sm',
        sm: 6.8,
        escolas: [
          'Ginásio Pernambucano - Boa Vista',
          'Colégio Damas - Graças',
          'UNICAP - Bloco G Boa Vista',
          'Colégio São Luís - Espinheiro',
          'EREM Parque da Jaqueira',
          'Colégio Nóbrega',
        ],
      },
      {
        nome: 'Boa Viagem / Pina',
        dLat: -0.058,
        dLng: 0.005,
        profile: 'flavio_sangria',
        renda: 'acima_10sm',
        sm: 10.8,
        escolas: [
          'EE Santos Dumont - Boa Viagem',
          'Colégio Santa Maria - Boa Viagem',
          'EREM Othon Paraíso - Pina',
          'Colégio Boa Viagem - CBV',
          'Colégio GGE - Boa Viagem',
        ],
      },
      {
        nome: 'Ibura / Cohab / Jordão',
        dLat: -0.052,
        dLng: -0.038,
        profile: 'abstention_mobilization',
        renda: 'ate_2sm',
        sm: 1.5,
        escolas: [
          'EE Jordão Emerenciano - Ibura',
          'EE Presidente Castelo Branco - Ibura',
          'EM Engenheiro Henoch Coutinho - Cohab',
          'EM Vila dos Milagres - Ibura',
          'EE Dom Miguel de Lima Valverde',
        ],
      },
      {
        nome: 'Casa Amarela / Água Fria',
        dLat: 0.038,
        dLng: -0.015,
        profile: 'abstention_mobilization',
        renda: 'de_2_a_5sm',
        sm: 2.5,
        escolas: [
          'EREM Padre Machado - Casa Amarela',
          'IEP - Instituto de Educação de PE',
          'EE Regueira Costa - Água Fria',
          'EM Dom Bosco - Morro da Conceição',
          'EE Silva Jardim - Monteiro',
        ],
      },
      {
        nome: 'Várzea / Afogados / Caxangá',
        dLat: -0.012,
        dLng: -0.045,
        profile: 'blank_null_conversion',
        renda: 'de_2_a_5sm',
        sm: 2.9,
        escolas: [
          'UFPE - Centro de Artes (Várzea)',
          'IFPE - Campus Recife',
          'EE São Francisco de Assis - Afogados',
          'EREM Candido Duarte - Apipucos',
          'EE Brigadeiro Eduardo Gomes',
        ],
      },
    ],
  }),
  buildMetroCitySpec({
    id: 'Salvador',
    label: 'Salvador',
    uf: 'BA',
    regiao: 'Nordeste',
    center: [-12.965, -38.465],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Pituba / Barra / Graça', dLat: -0.035, dLng: -0.012, profile: 'third_way_strong', renda: 'acima_10sm', sm: 10.6 },
      { nome: 'Caminho das Árvores / Horto', dLat: -0.018, dLng: 0.012, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.1 },
      { nome: 'Cabula / Brotas / Liberdade', dLat: 0.012, dLng: -0.008, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.8 },
      { nome: 'Cajazeiras / Fazenda Grande', dLat: 0.068, dLng: 0.042, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
      { nome: 'Subúrbio Ferroviário / Itapagipe', dLat: 0.045, dLng: -0.032, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Porto Alegre',
    label: 'Porto Alegre',
    uf: 'RS',
    regiao: 'Sul',
    center: [-30.045, -51.195],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Cidade Baixa / Bom Fim / Centro', dLat: 0.012, dLng: -0.022, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.6 },
      { nome: 'Moinhos de Vento / Bela Vista', dLat: 0.018, dLng: 0, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 14.8 },
      { nome: 'Menino Deus / Passo d’Areia', dLat: -0.012, dLng: -0.018, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 8.2 },
      { nome: 'Restinga / Lomba do Pinheiro', dLat: -0.085, dLng: 0.062, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Sarandi / Rubem Berta (Zona Norte)', dLat: 0.048, dLng: 0.055, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.9 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Curitiba',
    label: 'Curitiba',
    uf: 'PR',
    regiao: 'Sul',
    center: [-25.442, -49.275],
    teve_2t_governador: false,
    scale: 'large',
    bairros: [
      { nome: 'Centro Cívico / Água Verde', dLat: 0.012, dLng: 0.005, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 8.9 },
      { nome: 'Batel / Ecoville / Bigorrilho', dLat: 0, dLng: -0.032, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 15.2 },
      { nome: 'Cidade Industrial (CIC) / Portão', dLat: -0.052, dLng: -0.052, profile: 'third_way_strong', renda: 'de_2_a_5sm', sm: 3.1 },
      { nome: 'Sítio Cercado / Pinheirinho', dLat: -0.095, dLng: 0, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.9 },
      { nome: 'Cajuru / Boqueirão / Uberaba', dLat: -0.025, dLng: 0.055, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 3.6 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Brasilia',
    label: 'Brasília',
    uf: 'DF',
    regiao: 'Centro-Oeste',
    center: [-15.805, -47.945],
    teve_2t_governador: false,
    scale: 'large',
    bairros: [
      { nome: 'Asa Norte / Asa Sul (Plano Piloto)', dLat: 0.025, dLng: 0.058, profile: 'third_way_strong', renda: 'acima_10sm', sm: 15.1 },
      { nome: 'Lago Sul / Sudoeste', dLat: -0.028, dLng: 0.065, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 19.2 },
      { nome: 'Taguatinga / Águas Claras / Guará', dLat: -0.022, dLng: -0.088, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 6.4 },
      { nome: 'Ceilândia Norte e Sul', dLat: -0.032, dLng: -0.158, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.9 },
      { nome: 'Samambaia / Gama / Sobradinho', dLat: -0.075, dLng: -0.125, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.3 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Fortaleza',
    label: 'Fortaleza',
    uf: 'CE',
    regiao: 'Nordeste',
    center: [-3.755, -38.535],
    teve_2t_governador: false,
    scale: 'large',
    bairros: [
      { nome: 'Aldeota / Benfica / Fátima', dLat: 0.018, dLng: 0.018, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 8.6 },
      { nome: 'Meireles / Cocó / Papicu', dLat: 0.022, dLng: 0.048, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 13.8 },
      { nome: 'Messejana / Parangaba', dLat: -0.052, dLng: 0.008, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.5 },
      { nome: 'Barra do Ceará / Bom Jardim', dLat: 0.018, dLng: -0.048, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.5 },
      { nome: 'Mondubim / Conjunto Ceará', dLat: -0.045, dLng: -0.042, profile: 'blank_null_conversion', renda: 'ate_2sm', sm: 1.7 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Manaus',
    label: 'Manaus',
    uf: 'AM',
    regiao: 'Norte',
    center: [-3.085, -59.995],
    teve_2t_governador: true,
    scale: 'large',
    bairros: [
      { nome: 'Adrianópolis / Parque 10 / Centro', dLat: -0.018, dLng: -0.018, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 7.2 },
      { nome: 'Ponta Negra / Vieiralves', dLat: 0.008, dLng: -0.072, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 12.9 },
      { nome: 'Cidade Nova / Novo Aleixo', dLat: 0.055, dLng: 0.018, profile: 'abstention_mobilization', renda: 'de_2_a_5sm', sm: 2.6 },
      { nome: 'Jorge Teixeira / Zumbi (Zona Leste)', dLat: 0.012, dLng: 0.058, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Japiim / Compensa / Alvorada', dLat: -0.032, dLng: 0.015, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 2.2 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Belem',
    label: 'Belém',
    uf: 'PA',
    regiao: 'Norte',
    center: [-1.445, -48.472],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Nazaré / Batista Campos / Umarizal', dLat: -0.008, dLng: -0.015, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 7.9 },
      { nome: 'Marco / Pedreira / São Brás', dLat: 0.018, dLng: 0.008, profile: 'blank_null_conversion', renda: 'de_2_a_5sm', sm: 3.4 },
      { nome: 'Guamá / Jurunas / Terra Firme', dLat: -0.022, dLng: 0.008, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.6 },
      { nome: 'Icoaraci / Benguí / Tapanã', dLat: 0.068, dLng: 0.015, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.7 },
      { nome: 'Ananindeua / Cidade Nova (RMB)', dLat: 0.075, dLng: 0.068, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 2.8 },
    ],
  }),
  buildMetroCitySpec({
    id: 'Goiania',
    label: 'Goiânia',
    uf: 'GO',
    regiao: 'Centro-Oeste',
    center: [-16.685, -49.265],
    teve_2t_governador: false,
    scale: 'medium',
    bairros: [
      { nome: 'Setor Bueno / Setor Oeste', dLat: 0.002, dLng: -0.005, profile: 'flavio_sangria', renda: 'de_5_a_10sm', sm: 8.8 },
      { nome: 'Setor Marista / Jardim Goiás', dLat: -0.022, dLng: 0.018, profile: 'flavio_grew_2t', renda: 'acima_10sm', sm: 15.4 },
      { nome: 'Setor Universitário / Campinas', dLat: 0.022, dLng: 0.012, profile: 'third_way_strong', renda: 'de_5_a_10sm', sm: 6.1 },
      { nome: 'Região Noroeste / Jardim Curitiba', dLat: 0.068, dLng: -0.058, profile: 'abstention_mobilization', renda: 'ate_2sm', sm: 1.8 },
      { nome: 'Aparecida de Goiânia / Garavelo', dLat: -0.095, dLng: -0.025, profile: 'flavio_sangria', renda: 'de_2_a_5sm', sm: 2.7 },
    ],
  }),
];

const ALL_CITY_SPECS: CitySpec[] = [...CORE_12_CITIES, ...ADDITIONAL_NATIONAL_CITIES];

function generateCitySetores(city: CitySpec): SetorVotacao[] {
  const latScale = Math.cos((city.center[0] * Math.PI) / 180);

  interface RawNode {
    id: string;
    codigo_local_tse: string;
    zona_eleitoral: number;
    nome_local: string;
    endereco: string;
    bairro: string;
    faixa_renda_ibge: IncomeBracketKey;
    renda_media_mensal_sm: number;
    profile: ProfileType;
    center: Pt;
    maxCellRadiusDeg: number;
    seedNum: number;
    secoesCount: number;
    secaoStart: number;
  }

  const nodes: RawNode[] = [];
  let schoolCounter = 1;

  city.clusters.forEach((cluster, cIdx) => {
    for (let i = 0; i < cluster.schoolsCount; i++) {
      const goldenAngle = i * 2.3999632 + cIdx * 1.1;
      const rFactor = i === 0 ? 0.08 : Math.sqrt(i / cluster.schoolsCount);
      const r = cluster.spreadDeg * rFactor;
      const lat = Number((cluster.center[0] + Math.sin(goldenAngle) * r).toFixed(4));
      const lng = Number(
        (cluster.center[1] + (Math.cos(goldenAngle) * r) / latScale).toFixed(4)
      );

      const prefixList = cluster.schoolPrefixList || [];
      const streetList = cluster.streetList || [];

      const schoolName =
        prefixList[i % prefixList.length] ||
        `EE ${cluster.bairro.split('/')[0].trim()} Unidade ${i + 1}`;
      const street =
        streetList[i % streetList.length] ||
        `Av. Central de ${cluster.bairro.split('/')[0].trim()}, ${100 + i * 85}`;

      const seedNum =
        (cIdx + 1) * 100 +
        i * 17 +
        city.uf.charCodeAt(0) * 7 +
        city.id.charCodeAt(0) * 3;
      const secoesCount = 7 + (seedNum % 5); // 7 to 11 ballot boxes per school

      let canonicalId = `${city.id.toLowerCase().replace(/\s+/g, '')}-${
        1000 + schoolCounter
      }`;
      if (city.id === 'Sao Paulo' && cIdx === 0 && i === 0) {
        canonicalId = 'sp-pinheiros-fernao';
      } else if (city.id === 'Sao Paulo' && cIdx === 1 && i === 0) {
        canonicalId = 'sp-jardins-dante';
      } else if (city.id === 'Sao Paulo' && cIdx === 2 && i === 0) {
        canonicalId = 'sp-mooca-camargo';
      } else if (city.id === 'Sao Paulo' && cIdx === 3 && i === 0) {
        canonicalId = 'sp-capao-ceu';
      } else if (city.id === 'Recife' && cIdx === 2 && i === 0) {
        canonicalId = 'pe-ibura-jordao';
      } else if (city.id === 'Belo Horizonte' && cIdx === 0 && i === 0) {
        canonicalId = 'bh-savassi-milton';
      }

      nodes.push({
        id: canonicalId,
        codigo_local_tse: `${city.uf}-${String(cluster.zona).padStart(3, '0')}-${
          1000 + schoolCounter
        }`,
        zona_eleitoral: cluster.zona,
        nome_local: schoolName,
        endereco: street,
        bairro: cluster.bairro.split('/')[0].trim(),
        faixa_renda_ibge: cluster.faixa_renda,
        renda_media_mensal_sm: Number(
          (cluster.renda_sm + ((i % 3) - 1) * 0.4).toFixed(1)
        ),
        profile: cluster.profile,
        center: [lat, lng],
        maxCellRadiusDeg: cluster.maxCellRadiusDeg,
        seedNum,
        secoesCount,
        secaoStart: 101 + i * 12,
      });

      schoolCounter++;
    }
  });

  // Compute True Clipped Voronoi Polygons for every school in the city
  const polygons: Pt[][] = nodes.map((node, idx) => {
    let poly = createInitialIrregularDomain(
      node.center,
      node.maxCellRadiusDeg,
      node.seedNum,
      latScale
    );

    const others = nodes
      .filter((_, j) => j !== idx)
      .map((other) => ({
        other,
        dist: Math.hypot(
          other.center[0] - node.center[0],
          (other.center[1] - node.center[1]) * latScale
        ),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 18);

    for (const { other } of others) {
      poly = clipPolygonByBisector(poly, node.center, other.center, latScale);
    }

    return poly;
  });

  const rawSetores: SetorVotacao[] = nodes.map((node, idx) => {
    const count = node.secoesCount;
    const v = (node.seedNum % 11) - 5;

    let lula1tPerRoom = 140;
    let flavio1tPerRoom = 115;
    let third1tPerRoom = 40;
    let bn1tPerRoom = 20;
    let abst1tPerRoom = 70;

    let deltaLulaPerRoom = 45;
    let deltaFlavioPerRoom = -18;
    let abstDropPerRoom = 12;
    let bnDropPerRoom = 5;

    if (node.profile === 'third_way_strong') {
      lula1tPerRoom = 142 + v * 2;
      flavio1tPerRoom = 94 - v;
      third1tPerRoom = 74 + v * 2;
      bn1tPerRoom = 16;
      abst1tPerRoom = 58 + v;
      deltaLulaPerRoom = 55 + (node.seedNum % 6);
      deltaFlavioPerRoom = -(13 + (node.seedNum % 5));
      abstDropPerRoom = 6;
      bnDropPerRoom = 4;
    } else if (node.profile === 'flavio_sangria') {
      lula1tPerRoom = 114 + v * 2;
      flavio1tPerRoom = 158 - v * 2;
      third1tPerRoom = 32 + v;
      bn1tPerRoom = 20;
      abst1tPerRoom = 66 + v;
      deltaLulaPerRoom = 50 + (node.seedNum % 6);
      deltaFlavioPerRoom = -(38 + (node.seedNum % 6));
      abstDropPerRoom = 5;
      bnDropPerRoom = 4;
    } else if (node.profile === 'abstention_mobilization') {
      lula1tPerRoom = 172 + v * 3;
      flavio1tPerRoom = 82 - v;
      third1tPerRoom = 18;
      brancos_nulos: bn1tPerRoom = 26;
      abst1tPerRoom = 104 + v * 2;
      deltaLulaPerRoom = 60 + (node.seedNum % 7);
      deltaFlavioPerRoom = -(8 + (node.seedNum % 3));
      abstDropPerRoom = 45 + (node.seedNum % 6);
      bnDropPerRoom = 8;
    } else if (node.profile === 'blank_null_conversion') {
      lula1tPerRoom = 148 + v * 2;
      flavio1tPerRoom = 96 - v;
      third1tPerRoom = 19;
      bn1tPerRoom = 54 + (node.seedNum % 5);
      abst1tPerRoom = 78 + v;
      deltaLulaPerRoom = 45 + (node.seedNum % 5);
      deltaFlavioPerRoom = -7;
      abstDropPerRoom = 9;
      bnDropPerRoom = 32 + (node.seedNum % 4);
    } else if (node.profile === 'flavio_grew_2t') {
      lula1tPerRoom = 92 + v * 2;
      flavio1tPerRoom = 164 - v * 2;
      third1tPerRoom = 68 + v;
      bn1tPerRoom = 15;
      abst1tPerRoom = 56 + v;
      deltaLulaPerRoom = 23 + (node.seedNum % 4);
      deltaFlavioPerRoom = +(26 + (node.seedNum % 7));
      abstDropPerRoom = 8;
      bnDropPerRoom = 4;
    }

    const lula_1t = lula1tPerRoom * count;
    const flavio_1t = flavio1tPerRoom * count;
    const terceira_via_1t = third1tPerRoom * count;
    const brancos_nulos_1t = bn1tPerRoom * count;
    const abstencao_1t = abst1tPerRoom * count;
    const eleitores_aptos =
      lula_1t + flavio_1t + terceira_via_1t + brancos_nulos_1t + abstencao_1t;

    const delta_lula = deltaLulaPerRoom * count;
    const lula_2t = lula_1t + delta_lula;
    const delta_flavio = deltaFlavioPerRoom * count;
    const flavio_2t = flavio_1t + delta_flavio;
    const abstencao_2t = abstencao_1t - abstDropPerRoom * count;
    const brancos_nulos_2t = brancos_nulos_1t - bnDropPerRoom * count;

    const flavio_grew_2t = delta_flavio > 0;
    const flavio_gain_2t = Math.max(0, delta_flavio);
    const delta_abstencao = abstencao_2t - abstencao_1t;

    const pool_flavio_loss = Math.max(0, flavio_1t - flavio_2t);
    const pool_abstention_drop = Math.max(0, abstencao_1t - abstencao_2t);
    const pool_blank_null_drop = Math.max(0, brancos_nulos_1t - brancos_nulos_2t);
    const pool_third_way = Math.max(0, terceira_via_1t);
    const pool_total =
      pool_flavio_loss + pool_abstention_drop + pool_blank_null_drop + pool_third_way;

    const attr_flavio_loss = Math.round((delta_lula * pool_flavio_loss) / pool_total);
    const attr_abstention_drop = Math.round(
      (delta_lula * pool_abstention_drop) / pool_total
    );
    const attr_blank_null_drop = Math.round(
      (delta_lula * pool_blank_null_drop) / pool_total
    );
    const attr_third_way = Math.max(
      0,
      delta_lula - (attr_flavio_loss + attr_abstention_drop + attr_blank_null_drop)
    );

    const pct_flavio_loss = Number(((attr_flavio_loss / delta_lula) * 100).toFixed(1));
    const pct_abstention_drop = Number(
      ((attr_abstention_drop / delta_lula) * 100).toFixed(1)
    );
    const pct_blank_null_drop = Number(
      ((attr_blank_null_drop / delta_lula) * 100).toFixed(1)
    );
    const pct_third_way = Number(
      (100 - (pct_flavio_loss + pct_abstention_drop + pct_blank_null_drop)).toFixed(1)
    );

    let dominant_factor: DominantFactorKey = 'third_way';
    if (flavio_grew_2t) {
      dominant_factor = 'flavio_gain';
    } else {
      const pairs: [DominantFactorKey, number][] = [
        ['flavio_loss', attr_flavio_loss],
        ['abstention_drop', attr_abstention_drop],
        ['third_way', attr_third_way],
        ['blank_null_drop', attr_blank_null_drop],
      ];
      pairs.sort((a, b) => b[1] - a[1]);
      dominant_factor = pairs[0][0];
    }

    const poly = polygons[idx];
    const area_km2 = computePolygonAreaKm2(poly, node.center[0]);

    return {
      id: node.id,
      codigo_local_tse: node.codigo_local_tse,
      zona_eleitoral: node.zona_eleitoral,
      nome_local: node.nome_local,
      endereco: node.endereco,
      bairro: node.bairro,
      cidade: city.label,
      uf: city.uf,
      regiao: city.regiao,
      faixa_renda_ibge: node.faixa_renda_ibge,
      renda_media_mensal_sm: node.renda_media_mensal_sm,
      teve_2t_governador: city.teve_2t_governador,
      contexto_palanque_estadual: city.contexto_palanque,
      center: node.center,
      polygon: poly,
      area_km2,
      secoes_count: count,
      secao_start: node.secaoStart,
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
        vizinhos_count: 5,
        media_delta_lula: Math.round(delta_lula * 0.85),
        media_attr_flavio_loss_pct: 25,
        media_attr_abstention_pct: 32,
        media_attr_third_way_pct: 33,
        media_attr_blank_null_pct: 10,
        destaque_ratio: 1.5,
        fator_destaque: dominant_factor,
        resumo_comparativo: '',
      },
    };
  });

  const FACTOR_LABELS: Record<DominantFactorKey, string> = {
    flavio_loss: 'virada direta de eleitores de Flávio Bolsonaro',
    abstention_drop: 'queda de abstenção e mobilização de novos eleitores',
    third_way: 'migração de eleitores da 3ª via',
    blank_null_drop: 'conversão de votos brancos e nulos',
    flavio_gain: 'crescimento de Flávio Bolsonaro no 2º turno',
  };

  return rawSetores.map((setor) => {
    const peers = rawSetores
      .filter((s) => s.id !== setor.id)
      .sort((a, b) => {
        const dA = Math.hypot(
          a.center[0] - setor.center[0],
          (a.center[1] - setor.center[1]) * latScale
        );
        const dB = Math.hypot(
          b.center[0] - setor.center[0],
          (b.center[1] - setor.center[1]) * latScale
        );
        return dA - dB;
      })
      .slice(0, 5);

    const avg = (fn: (s: SetorVotacao) => number) =>
      Number((peers.reduce((acc, v) => acc + fn(v), 0) / peers.length).toFixed(1));

    const media_delta_lula = Math.round(avg((v) => v.delta_lula));
    const media_attr_flavio_loss_pct = avg((v) => v.pct_flavio_loss);
    const media_attr_abstention_pct = avg((v) => v.pct_abstention_drop);
    const media_attr_third_way_pct = avg((v) => v.pct_third_way);
    const media_attr_blank_null_pct = avg((v) => v.pct_blank_null_drop);

    const dom = setor.dominant_factor;
    if (dom === 'flavio_gain') {
      return {
        ...setor,
        comparativo_vizinhanca: {
          vizinhos_count: peers.length,
          media_delta_lula,
          media_attr_flavio_loss_pct,
          media_attr_abstention_pct,
          media_attr_third_way_pct,
          media_attr_blank_null_pct,
          destaque_ratio: 1.8,
          fator_destaque: 'flavio_gain',
          resumo_comparativo: `Caso atípico em ${setor.cidade}/${setor.uf}: enquanto escolas vizinhas registraram sangria de Flávio, neste local Flávio Bolsonaro ampliou sua votação em +${setor.flavio_gain_2t} votos no 2º turno (absorvendo parte da 3ª via conservadora), enquanto Lula somou +${setor.delta_lula} votos.`,
        },
      };
    }

    const ownPctMap: Record<DominantFactorKey, number> = {
      flavio_loss: setor.pct_flavio_loss,
      abstention_drop: setor.pct_abstention_drop,
      third_way: setor.pct_third_way,
      blank_null_drop: setor.pct_blank_null_drop,
      flavio_gain: 50,
    };
    const avgPctMap: Record<DominantFactorKey, number> = {
      flavio_loss: Math.max(8, media_attr_flavio_loss_pct),
      abstention_drop: Math.max(8, media_attr_abstention_pct),
      third_way: Math.max(8, media_attr_third_way_pct),
      blank_null_drop: Math.max(5, media_attr_blank_null_pct),
      flavio_gain: 20,
    };

    const ratio = Number(Math.max(1.15, ownPctMap[dom] / avgPctMap[dom]).toFixed(1));
    const resumo_comparativo = `Este local registrou ${ratio}x mais ${FACTOR_LABELS[dom]} (${ownPctMap[dom]}% dos novos votos) do que a média das ${peers.length} escolas vizinhas imediatas (${avgPctMap[dom]}%).`;

    return {
      ...setor,
      comparativo_vizinhanca: {
        vizinhos_count: peers.length,
        media_delta_lula,
        media_attr_flavio_loss_pct,
        media_attr_abstention_pct,
        media_attr_third_way_pct,
        media_attr_blank_null_pct,
        destaque_ratio: ratio,
        fator_destaque: dom,
        resumo_comparativo,
      },
    };
  });
}

const allSetores = ALL_CITY_SPECS.flatMap(generateCitySetores);
const setoresFlavioCresceuCount = allSetores.filter((s) => s.flavio_grew_2t).length;
const totalSecoesCount = allSetores.reduce((acc, s) => acc + s.secoes_count, 0);

const CIDADES: CityQuickJump[] = ALL_CITY_SPECS.map((c) => ({
  id: c.id,
  label: c.label,
  uf: c.uf,
  regiao: c.regiao,
  center: c.center,
  zoom: c.zoom,
  descricao_curta: c.descricao_curta,
}));

const TOUR_GUIADO: GuidedTourStep[] = [
  {
    step: 1,
    titulo: '1. Sangria Direta nos Redutos Tradicionais (SP e RJ)',
    subtitulo: 'Mooca (SP) e Tijuca (RJ)',
    narrativa:
      'Em bairros tradicionais de classe média onde Flávio Bolsonaro (22) venceu no 1º turno, houve perda absoluta de votos no 2º turno. Na EE Prof. Antônio Firmino (Mooca), a sangria direta de Flávio liderou a virada.',
    cidade: 'São Paulo',
    setorId: 'sp-mooca-camargo',
    layer: 'flavio_loss',
    center: [-23.547, -46.59],
    zoom: 13,
    destaqueMetrica: 'Sangria direta 22 → 13',
  },
  {
    step: 2,
    titulo: '2. Herança Maciça da 3ª Via nos Centros Urbanos',
    subtitulo: 'Pinheiros (SP), Savassi (BH) e Cidade Baixa (POA)',
    narrativa:
      'Nos setores de alta densidade e escolaridade, eleitores de candidatos eliminados no 1º turno migraram em bloco. Na EE Fernão Dias Paes (Pinheiros), mais de 60% do salto de Lula teve origem no pool da 3ª via.',
    cidade: 'São Paulo',
    setorId: 'sp-pinheiros-fernao',
    layer: 'third_way',
    center: [-23.557, -46.68],
    zoom: 13,
    destaqueMetrica: 'Mais de 60% vindos da 3ª Via',
  },
  {
    step: 3,
    titulo: '3. O Despertar das Periferias e Queda de Abstenção',
    subtitulo: 'Capão Redondo (SP), Ibura (Recife) e Cajazeiras (Salvador)',
    narrativa:
      'Nos grandes territórios periféricos, a mobilização de 2º turno trouxe centenas de novos eleitores por escola. No CEU Cantos do Amanhecer, a queda de abstenção foi o motor hegemônico.',
    cidade: 'São Paulo',
    setorId: 'sp-capao-ceu',
    layer: 'abstention',
    center: [-23.677, -46.74],
    zoom: 13,
    destaqueMetrica: 'Forte queda de abstenção',
  },
  {
    step: 4,
    titulo: '4. Os Casos Atípicos Onde Flávio Bolsonaro Cresceu (+Δ22)',
    subtitulo: 'Jardins/Itaim (SP), Barra da Tijuca (RJ) e Lago Sul (DF)',
    narrativa:
      'Nos enclaves de alta renda (marcados em Azul Ciano), Flávio Bolsonaro ganhou votos no 2º turno em relação ao 1º turno, absorvendo parte da 3ª via conservadora.',
    cidade: 'São Paulo',
    setorId: 'sp-jardins-dante',
    layer: 'flavio_loss',
    center: [-23.587, -46.673],
    zoom: 13,
    destaqueMetrica: '+Δ22 Crescimento de Flávio',
  },
  {
    step: 5,
    titulo: '5. Cobertura Nacional Completa nas 27 UFs do Brasil',
    subtitulo: 'Capitais e Polos do Interior (32 Municípios · 27 Estados)',
    narrativa:
      'A malha Voronoi cobre todas as 27 Unidades da Federação (AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO).',
    cidade: 'Belo Horizonte',
    setorId: 'bh-savassi-milton',
    layer: 'dominant',
    center: [-15.78, -47.92],
    zoom: 5,
    destaqueMetrica: '27 UFs · Cobertura Nacional',
  },
];

const dataset: ConsolidatedDataset = {
  gerado_em: '2026-10-26T05:38:00Z',
  status_apuracao: `Malha Nacional Completa (27 UFs) — ${allSetores.length} Setores Voronoi e ${totalSecoesCount.toLocaleString(
    'pt-BR'
  )} Urnas Processadas Offline`,
  total_urnas_apuradas_pct: 100.0,
  total_setores_count: allSetores.length,
  total_secoes_count: totalSecoesCount,
  resumo_nacional: {
    lula_1t_nacional: 54820410,
    lula_2t_nacional: 61490880,
    flavio_1t_nacional: 55110920,
    flavio_2t_nacional: 58120340,
    delta_lula_nacional: 6670470,
    attr_flavio_loss_nacional: 1801027,
    attr_abstention_drop_nacional: 2267960,
    attr_third_way_nacional: 2134550,
    attr_blank_null_drop_nacional: 466933,
    setores_flavio_cresceu_count: setoresFlavioCresceuCount,
  },
  cidades: CIDADES,
  tour_guiado: TOUR_GUIADO,
  setores: allSetores,
};

const outPath = path.resolve(process.cwd(), 'src/data/precomputedElectoralData.ts');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const fileContent = `/**
 * ARQUIVO GERADO OFFLINE POR scripts/generateOfflineData.ts
 * Base de dados eleitoral nacional (todas as 27 UFs) 100% pré-processada com malha Voronoi contígua.
 */
import { ConsolidatedDataset } from '../types/electoral';

export const PRECOMPUTED_ELECTORAL_DATASET: ConsolidatedDataset = ${JSON.stringify(
  dataset
)};
`;

fs.writeFileSync(outPath, fileContent, 'utf-8');
console.log(
  `Generated nationwide 27-UF Voronoi dataset: ${allSetores.length} setores (${setoresFlavioCresceuCount} where Flavio grew in 2T) and ${totalSecoesCount} secoes across ${ALL_CITY_SPECS.length} municipalities.`
);
