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

/**
 * 2D Point [lat, lng]
 * Uses Sutherland-Hodgman half-plane clipping to compute true contiguous Voronoi cells
 * where neighboring voting locations share exact borders and have variable sizes based on density!
 */
type Pt = [number, number];

function clipPolygonByBisector(
  poly: Pt[],
  site: Pt,
  other: Pt,
  latScale: number
): Pt[] {
  if (poly.length === 0) return [];
  // Convert to metric-like coordinates centered at site
  const midLat = (site[0] + other[0]) / 2;
  const midLng = (site[1] + other[1]) / 2;
  // Normal vector pointing from site to other (in metric space)
  const nx = other[0] - site[0];
  const ny = (other[1] - site[1]) * latScale;

  // A point P is closer to `site` than `other` iff dot(P - mid, N) <= 0
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

function createInitialIrregularDomain(
  center: Pt,
  maxRadiusDeg: number,
  seed: number,
  latScale: number
): Pt[] {
  // 14-vertex irregular organic boundary for outer clipping (only affects outer fringe of peripheral cells;
  // interior cells are 100% clipped by straight Voronoi bisectors with their neighbors!)
  const n = 14;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + ((seed % 5) * 0.04);
    const jitter = 0.88 + (((seed * (i + 7)) % 13) / 13) * 0.24;
    const r = maxRadiusDeg * jitter;
    const dLat = Math.sin(angle) * r;
    const dLng = (Math.cos(angle) * r) / latScale;
    pts.push([
      Number((center[0] + dLat).toFixed(5)),
      Number((center[1] + dLng).toFixed(5)),
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

interface DistrictCluster {
  bairro: string;
  zona: number;
  center: [number, number];
  spreadDeg: number; // smaller in dense center, larger in periphery
  maxCellRadiusDeg: number;
  schoolsCount: number;
  faixa_renda: IncomeBracketKey;
  renda_sm: number;
  profile:
    | 'third_way_strong'
    | 'flavio_sangria'
    | 'abstention_mobilization'
    | 'blank_null_conversion'
    | 'flavio_grew_2t';
  schoolPrefixList: string[];
  streetList: string[];
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

const CITY_SPECS: CitySpec[] = [
  // ==================== 1. SÃO PAULO (SP) — 92 Setores ====================
  {
    id: 'Sao Paulo',
    label: 'São Paulo',
    uf: 'SP',
    regiao: 'Sudeste',
    center: [-23.562, -46.645],
    zoom: 12,
    teve_2t_governador: true,
    contexto_palanque: '2º Turno Estadual Ativo (SP)',
    descricao_curta:
      'Mosaico completo da virada: 3ª via no centro expandido, sangria na Zona Leste/Norte, queda de abstenção no extremo sul e avanço de Flávio nos Jardins/Itaim.',
    clusters: [
      {
        bairro: 'Pinheiros',
        zona: 251,
        center: [-23.5642, -46.6915],
        spreadDeg: 0.014,
        maxCellRadiusDeg: 0.011,
        schoolsCount: 7,
        faixa_renda: 'acima_10sm',
        renda_sm: 14.2,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'EE Fernão Dias Paes',
          'EMEF Des. Achilles de Oliveira',
          'Colégio Palmares - Unidade Pinheiros',
          'EE Prof. Antônio Alves Cruz',
          'Colégio Oswald de Andrade - Girassol',
          'EE Dra. Maria Augusta Saraiva',
          'Instituto Dom Bosco - Pinheiros',
        ],
        streetList: [
          'Av. Pedroso de Morais, 420',
          'Rua Teodoro Sampaio, 1890',
          'Rua Cardeal Arcoverde, 1120',
          'Rua dos Pinheiros, 740',
          'Rua Fradique Coutinho, 910',
          'Rua Cunha Gago, 380',
          'Rua Artur de Azevedo, 1340',
        ],
      },
      {
        bairro: 'Perdizes / Pompeia',
        zona: 2,
        center: [-23.5365, -46.6745],
        spreadDeg: 0.014,
        maxCellRadiusDeg: 0.011,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 13.4,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'Colégio Estadual Perdizes / Entorno PUC',
          'EE Brigadeiro Gavião Peixoto',
          'Colégio Sagrado Coração de Jesus',
          'EE Prof. Manuel Ciridião Buarque',
          'EMEF Olavo Pezzotti',
          'Colégio Santa Marcelina - Perdizes',
        ],
        streetList: [
          'Rua Monte Alegre, 984',
          'Av. Alfonso Bovero, 620',
          'Rua Caraíbas, 410',
          'Rua Apinajés, 1100',
          'Rua Cardoso de Almeida, 790',
          'Rua Venâncio Aires, 530',
        ],
      },
      {
        bairro: 'Consolação / Bela Vista',
        zona: 1,
        center: [-23.5535, -46.6515],
        spreadDeg: 0.013,
        maxCellRadiusDeg: 0.01,
        schoolsCount: 7,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 9.4,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'EE Caetano de Campos - Consolação',
          'EE Rodrigues Alves - Av. Paulista',
          'Colégio São Luís - Bela Vista',
          'EE Dona Maria José - Bixiga',
          'Universidade Presbiteriana Mackenzie - Prédio 3',
          'EMEF Cel. Romão Gomes',
          'Colégio Rio Branco - Higienópolis',
        ],
        streetList: [
          'Praça Roosevelt, 200',
          'Av. Paulista, 227',
          'Rua Bela Cintra, 640',
          'Rua Treze de Maio, 1080',
          'Rua da Consolação, 930',
          'Rua Frei Caneca, 510',
          'Av. Higienópolis, 996',
        ],
      },
      {
        bairro: 'Jardins / Itaim Bibi',
        zona: 252,
        center: [-23.5785, -46.6735],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 18.6,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Dante Alighieri - Jardim Paulista',
          'EE Ludovina Credídio Peixoto - Itaim Bibi',
          'Colégio Assunção - Alameda Lorena',
          'EMEF Padre Manoel de Paiva - Itaim',
          'Colégio Pueri Domus - Verbo Divino',
          'EE Conde José Vicente de Azevedo',
        ],
        streetList: [
          'Alameda Jaú, 1061',
          'Rua Joaquim Floriano, 680',
          'Alameda Lorena, 665',
          'Rua João Cachoeira, 910',
          'Av. Nove de Julho, 4210',
          'Rua Estados Unidos, 1420',
        ],
      },
      {
        bairro: 'Vila Mariana / Saúde',
        zona: 5,
        center: [-23.5965, -46.6365],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 7,
        faixa_renda: 'acima_10sm',
        renda_sm: 12.1,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'Colégio Marista Arquidiocesano',
          'EE Mal. Floriano Peixoto',
          'Colégio Bandeirantes - Vila Mariana',
          'EE Prof. José Maria Whitaker',
          'Colégio Madre Cabrini',
          'EMEF Jairo Ramos - Saúde',
          'Instituto de Ensino Liceu Pasteur',
        ],
        streetList: [
          'Rua Domingos de Morais, 2565',
          'Rua Vergueiro, 3100',
          'Rua Estela, 268',
          'Av. Jabaquara, 1180',
          'Rua Madre Cabrini, 36',
          'Rua Sena Madureira, 820',
          'Rua Mairinque, 256',
        ],
      },
      {
        bairro: 'Moema / Brooklin',
        zona: 258,
        center: [-23.6065, -46.6665],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 5,
        faixa_renda: 'acima_10sm',
        renda_sm: 16.4,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Mobile - Moema',
          'CONSA - Colégio Franciscano N. Sra. Aparecida',
          'EE Sabóia de Medeiros - Brooklin',
          'Colégio Vértice - Campo Belo',
          'EMEF Prof. Mario Marques de Oliveira',
        ],
        streetList: [
          'Rua Diogo Jácome, 848',
          'Av. Miruna, 480',
          'Rua Ribeiro do Vale, 510',
          'Rua Vieira de Morais, 920',
          'Av. Ibirapuera, 2490',
        ],
      },
      {
        bairro: 'Mooca / Belém',
        zona: 4,
        center: [-23.5545, -46.5945],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 7,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 7.4,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'EE Prof. Antônio Firmino de Proença',
          'EE Oswaldo Cruz - Mooca',
          'Colégio São Judas Tadeu',
          'EE Pandiá Calógeras - Belém',
          'EMEF Pres. Kennedy - Alto da Mooca',
          'Colégio Agostiniano Mendel - Água Rasa',
          'EE Amadeu Amaral',
        ],
        streetList: [
          'Rua da Mooca, 2680',
          'Av. Paes de Barros, 910',
          'Rua Taquari, 546',
          'Av. Celso Garcia, 2210',
          'Rua do Oratório, 1420',
          'Rua Juventus, 680',
          'Rua Sapucaia, 410',
        ],
      },
      {
        bairro: 'Tatuapé / Penha',
        zona: 253,
        center: [-23.5365, -46.5565],
        spreadDeg: 0.019,
        maxCellRadiusDeg: 0.014,
        schoolsCount: 7,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 8.1,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'EE Brasílio Machado - Tatuapé',
          'Colégio Espírito Santo - Tatuapé',
          'EE Ascendino Reis - Carrão',
          'EE Nossa Senhora da Penha',
          'EMEF Jackson de Figueiredo',
          'Colégio Amorim - Vila Gomes Cardim',
          'EE Prof. Frederico Vergueiro Steidel',
        ],
        streetList: [
          'Rua Serra de Bragança, 980',
          'Rua Tuiuti, 1840',
          'Av. Conselheiro Carrão, 2110',
          'Rua Padre João, 420',
          'Rua Monte Serrat, 710',
          'Rua Cantagalo, 1120',
          'Av. Amador Bueno da Veiga, 1590',
        ],
      },
      {
        bairro: 'Santana / Tucuruvi',
        zona: 249,
        center: [-23.4945, -46.6215],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.015,
        schoolsCount: 7,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 7.8,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'Colégio Imperatriz Leopoldina - Santana',
          'EE Padre Antônio Vieira',
          'Colégio Salesiano Santa Teresinha',
          'EE Albino César - Tucuruvi',
          'EMEF Gal. Júlio Marcondes Salgado',
          'EE Prof. Silva Jardim - Tucuruvi',
          'Colégio Jardim São Paulo',
        ],
        streetList: [
          'Rua Voluntários da Pátria, 2460',
          'Av. Braz Leme, 1780',
          'Rua Domingos Calheiros, 180',
          'Av. Nova Cantareira, 1980',
          'Av. Mazzei, 840',
          'Rua Alfredo Pujol, 910',
          'Av. Leôncio de Magalhães, 1210',
        ],
      },
      {
        bairro: 'Brás / Pari / Bom Retiro',
        zona: 3,
        center: [-23.5335, -46.6195],
        spreadDeg: 0.015,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 5,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 3.2,
        profile: 'blank_null_conversion',
        schoolPrefixList: [
          'EE Padre Anchieta - Brás',
          'EE Prudente de Moraes - Bom Retiro',
          'ETEC Carlos de Campos - Brás',
          'EMEF Infante Dom Henrique - Canindé',
          'EE João Kopke - Luz',
        ],
        streetList: [
          'Rua Visconde de Abaeté, 154',
          'Praça Cel. Fernando Prestes, 74',
          'Rua Monsenhor Andrade, 798',
          'Rua Hannemann, 352',
          'Rua Prates, 310',
        ],
      },
      {
        bairro: 'Itaquera / São Mateus',
        zona: 417,
        center: [-23.5495, -46.4495],
        spreadDeg: 0.026,
        maxCellRadiusDeg: 0.02,
        schoolsCount: 8,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.3,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'CEU São Pedro / José Bonifácio',
          'EE Prof. Camilo Marques Paula - Itaquera',
          'CEU Azul da Cor do Mar',
          'EMEF Águia de Haia - Cidade AE Carvalho',
          'EE Fazenda do Carmo',
          'CEU Alto Alegre - São Mateus',
          'EMEF Conjunto José Bonifácio',
          'EE Dom Bernardo José Mielle',
        ],
        streetList: [
          'Rua Prof. Lucila Cerqueira, 194',
          'Av. Jacu-Pêssego, 2410',
          'Av. Ernesto Souza Cruz, 2171',
          'Av. Águia de Haia, 3100',
          'Rua Sabbado D’Ângelo, 1280',
          'Av. Ragueb Chohfi, 3900',
          'Rua Virgínia Ferni, 1140',
          'Av. Campanella, 890',
        ],
      },
      {
        bairro: 'Capão Redondo / Campo Limpo',
        zona: 372,
        center: [-23.6615, -46.7745],
        spreadDeg: 0.026,
        maxCellRadiusDeg: 0.02,
        schoolsCount: 8,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.6,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'CEU Cantos do Amanhecer',
          'CEU Campo Limpo - Cardeal Arns',
          'EE Parque Fernanda',
          'EMEF M’Boi Mirim I',
          'CEU Casa Blanca',
          'EE Prof. Beatriz Lopes',
          'EMEF Maurício Simão - Jardim Ângela',
          'EE Júlio de Mesquita Filho - Piraporinha',
        ],
        streetList: [
          'Av. Cantos do Amanhecer, s/n',
          'Av. Carlos Lacerda, 678',
          'Estrada de Itapecerica, 4920',
          'Estrada do M’Boi Mirim, 3410',
          'Rua João Damasceno, 85',
          'Av. Ellis Maas, 540',
          'Av. Comendador Sant’Anna, 1290',
          'Estrada do Campo Limpo, 3810',
        ],
      },
      {
        bairro: 'Grajaú / Cidade Dutra',
        zona: 373,
        center: [-23.7295, -46.6965],
        spreadDeg: 0.028,
        maxCellRadiusDeg: 0.022,
        schoolsCount: 7,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.5,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EMEF Prof. Carlos Corrêa Mascaro',
          'CEU Navegantes - Grajaú',
          'CEU Vila Rubi - Cidade Dutra',
          'EE Prof.Renato Braga - Parque Cocaia',
          'CEU Três Lagos',
          'EMEF Teodomiro Toledo Piza',
          'EE Herbert Baldus - Interlagos Sul',
        ],
        streetList: [
          'Av. Dona Belmira Marin, 3810',
          'Rua Maria Moassab Barbour, s/n',
          'Rua Domingos Tarroso, 101',
          'Av. Senador Teotônio Vilela, 4120',
          'Estrada do Barro Branco, s/n',
          'Rua São José do Rio Preto, 410',
          'Av. Atlântica, 3910',
        ],
      },
      {
        bairro: 'Brasilândia / Freguesia do Ó',
        zona: 389,
        center: [-23.4745, -46.6945],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 5,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.8,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'CEU Paz - Brasilândia',
          'CEU Jardim Paulistano',
          'EE Padre Manuel da Nóbrega - Freguesia',
          'EMEF Prof. Alceu Amoroso Lima',
          'EE Plínio Negrão - Vila Brasilândia',
        ],
        streetList: [
          'Rua Daniel Cerri, 1549',
          'Rua Aparecida do Taboado, s/n',
          'Av. Itaberaba, 1940',
          'Av. Parapuã, 1480',
          'Estrada do Sabão, 1120',
        ],
      },
    ],
  },

  // ==================== 2. RIO DE JANEIRO (RJ) — 66 Setores ====================
  {
    id: 'Rio de Janeiro',
    label: 'Rio de Janeiro',
    uf: 'RJ',
    regiao: 'Sudeste',
    center: [-22.915, -43.265],
    zoom: 12,
    teve_2t_governador: true,
    contexto_palanque: '2º Turno Estadual Ativo (RJ)',
    descricao_curta:
      'Sangria acentuada de Flávio Bolsonaro na Tijuca, Méier e Campo Grande; 3ª via nas Laranjeiras/Botafogo e crescimento de Flávio em parte da Barra da Tijuca.',
    clusters: [
      {
        bairro: 'Tijuca / Vila Isabel',
        zona: 7,
        center: [-22.9215, -43.2365],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.013,
        schoolsCount: 8,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 7.9,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'Colégio Pedro II - Campus Tijuca',
          'Instituto de Educação do Rio de Janeiro - Maracanã',
          'Colégio Militar do Rio de Janeiro - Seções Civis',
          'EM Soares Pereira - Praça Saens Peña',
          'Colégio Batista Shepard - Tijuca',
          'CE Coelho Neto - Vila Isabel',
          'EM Barão Homem de Mello',
          'Colégio Marista São José - Usina',
        ],
        streetList: [
          'Rua São Francisco Xavier, 204',
          'Rua Mariz e Barros, 273',
          'Rua Conde de Bonfim, 480',
          'Rua Desembargador Isidro, 140',
          'Rua José Higino, 416',
          'Boulevard 28 de Setembro, 390',
          'Rua Haddock Lobo, 310',
          'Rua Conde de Bonfim, 1067',
        ],
      },
      {
        bairro: 'Laranjeiras / Botafogo / Flamengo',
        zona: 4,
        center: [-22.9415, -43.1855],
        spreadDeg: 0.015,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 8,
        faixa_renda: 'acima_10sm',
        renda_sm: 12.2,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'Instituto Estadual de Educação - Laranjeiras',
          'Colégio Pedro II - Campus Humaitá',
          'Colégio Santo Inácio - Botafogo',
          'EM México - Botafogo',
          'Colégio Bennett - Flamengo',
          'CE Amaro Cavalcanti - Largo do Machado',
          'EM Presidente Arthur Bernardes',
          'Colégio Andrews - Voluntários da Pátria',
        ],
        streetList: [
          'Rua das Laranjeiras, 210',
          'Rua Humaitá, 80',
          'Rua São Clemente, 226',
          'Rua da Matriz, 62',
          'Rua Marquês de Abrantes, 55',
          'Largo do Machado, 20',
          'Praia de Botafogo, 340',
          'Rua Voluntários da Pátria, 310',
        ],
      },
      {
        bairro: 'Copacabana / Ipanema',
        zona: 5,
        center: [-22.9765, -43.1935],
        spreadDeg: 0.014,
        maxCellRadiusDeg: 0.011,
        schoolsCount: 7,
        faixa_renda: 'acima_10sm',
        renda_sm: 13.5,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'EM Infante Dom Henrique - Copacabana',
          'Colégio Sagrado Coração de Maria - Tonelero',
          'EM Roma - Lido',
          'Colégio Notre Dame - Ipanema',
          'EM Presidente José Linhares - Ipanema',
          'CE Pedro Álvares Cabral - Copacabana',
          'EM Cícero Pena - Av. Atlântica',
        ],
        streetList: [
          'Rua N. Sra. de Copacabana, 910',
          'Rua Tonelero, 56',
          'Praça Serzedelo Corrêa, 15',
          'Rua Barão da Torre, 308',
          'Rua Barão de Jaguaripe, 180',
          'Rua República do Peru, 310',
          'Av. Atlântica, 1980',
        ],
      },
      {
        bairro: 'Grande Méier / Engenho Novo',
        zona: 16,
        center: [-22.9015, -43.2815],
        spreadDeg: 0.018,
        maxCellRadiusDeg: 0.014,
        schoolsCount: 8,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 4.5,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'CE Visconde de Cairu - Méier',
          'Colégio Pedro II - Campus Engenho Novo',
          'EM República do Peru - Méier',
          'Colégio Metropolitano - Dias da Cruz',
          'EM Sarmiento - Engenho de Dentro',
          'CE Heitor Lira - Abolição',
          'EM Bento Ribeiro - Cachambi',
          'Instituto Coração de Jesus - Todos os Santos',
        ],
        streetList: [
          'Rua Arquias Cordeiro, 508',
          'Rua Barão do Bom Retiro, 726',
          'Rua Dias da Cruz, 480',
          'Rua Hermengarda, 310',
          'Av. Amaro Cavalcanti, 1420',
          'Rua da Abolição, 610',
          'Rua Honório, 980',
          'Rua Medina, 210',
        ],
      },
      {
        bairro: 'Madureira / Penha / Olaria',
        zona: 122,
        center: [-22.8615, -43.3145],
        spreadDeg: 0.022,
        maxCellRadiusDeg: 0.017,
        schoolsCount: 8,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.6,
        profile: 'blank_null_conversion',
        schoolPrefixList: [
          'CE Carmo Neto - Madureira',
          'EM Astolfo Rezende - Madureira',
          'CE Clóvis Monteiro - Higienópolis / Bonsucesso',
          'EM Bernardo Vasconcelos - Penha',
          'CIEP 118 - Vila da Penha',
          'CE João Alfredo - Vila Kosmos',
          'EM Paraíba - Rocha Miranda',
          'Colégio Estadual Compositor Luiz Carlos da Vila',
        ],
        streetList: [
          'Estrada do Portela, 312',
          'Av. Ministro Edgard Romero, 540',
          'Av. dos Democráticos, 1120',
          'Rua Conde de Agrolongo, 410',
          'Av. Meriti, 1890',
          'Av. Vicente de Carvalho, 920',
          'Estrada do Barro Vermelho, 380',
          'Rua Carolina Machado, 1180',
        ],
      },
      {
        bairro: 'Barra da Tijuca / Recreio',
        zona: 119,
        center: [-23.0015, -43.3665],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 15.8,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Santo Agostinho - Novo Leblon',
          'EM Golda Meir - Barra da Tijuca',
          'Colégio PH - Barra / Américas',
          'CE Indígena Galdino Pataxó - Recreio',
          'EM Professor Albert Einstein - Jardim Oceânico',
          'Colégio Bahiense - Parque das Rosas',
        ],
        streetList: [
          'Av. das Américas, 7800',
          'Av. Lúcio Costa, 3800',
          'Av. Prefeito Dulcídio Cardoso, 1900',
          'Av. Glaucio Gil, 910',
          'Av. Olegário Maciel, 420',
          'Av. Marechal Henrique Lott, 180',
        ],
      },
      {
        bairro: 'Bangu / Realengo',
        zona: 238,
        center: [-22.8765, -43.4585],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 7,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.9,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'CE Engenheiro João Thomé - Bangu',
          'Colégio Pedro II - Campus Realengo',
          'EM Nações Unidas - Bangu',
          'CIEP 308 Mestre Cartola - Padre Miguel',
          'EM Presidente Roosevelt - Senador Camará',
          'CE Marieta Cunha da Silva',
          'EM Ruy Barbosa - Vila Kennedy',
        ],
        streetList: [
          'Av. Cônego de Vasconcelos, 540',
          'Rua Bernardo de Vasconcelos, 941',
          'Rua Fonseca, 720',
          'Rua Figueiredo Camargo, 410',
          'Av. Santa Cruz, 3810',
          'Estrada da Água Branca, 1290',
          'Av. Brasil, 34200',
        ],
      },
      {
        bairro: 'Campo Grande / Santa Cruz',
        zona: 246,
        center: [-22.9055, -43.5625],
        spreadDeg: 0.028,
        maxCellRadiusDeg: 0.022,
        schoolsCount: 8,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.5,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'CIEP 312 Raul Ryff - Campo Grande',
          'CE Sarah Kubitschek - Campo Grande',
          'FEUC - Faculdades Integradas Campo-Grandenses',
          'EM Amazonas - West Shopping Entorno',
          'CE Barão de Pirassinunga',
          'EM Professora Zulmira Telles - Inhoaíba',
          'CE Dom Pedro I - Santa Cruz',
          'CIEP 201 Aarão Steinbruch - Paciência',
        ],
        streetList: [
          'Estrada da Caroba, 640',
          'Rua Augusto de Vasconcelos, 910',
          'Estrada do Mendanha, 1420',
          'Estrada da Posse, 2100',
          'Rua Coronel Agostinho, 380',
          'Av. Cesário de Melo, 6400',
          'Rua Felipe Cardoso, 810',
          'Estrada de Santa Eugênia, 520',
        ],
      },
    ],
  },

  // ==================== 3. BELO HORIZONTE (MG) — 50 Setores ====================
  {
    id: 'Belo Horizonte',
    label: 'Belo Horizonte',
    uf: 'MG',
    regiao: 'Sudeste',
    center: [-19.922, -43.945],
    zoom: 12,
    teve_2t_governador: true,
    contexto_palanque: '2º Turno Estadual Ativo (MG)',
    descricao_curta:
      'Síntese do Brasil: 3ª via decisiva na Savassi/Funcionários, sangria no Padre Eustáquio, queda de abstenção em Venda Nova e avanço de Flávio no Belvedere/Lourdes.',
    clusters: [
      {
        bairro: 'Savassi / Funcionários / Centro',
        zona: 26,
        center: [-19.9345, -43.9345],
        spreadDeg: 0.015,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 9,
        faixa_renda: 'acima_10sm',
        renda_sm: 11.9,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'EE Governador Milton Campos (Estadual Central)',
          'Colégio Santo Antônio - Savassi',
          'Instituto de Educação de Minas Gerais (IEMG)',
          'Colégio Marista Dom Silvério',
          'EE Afonso Pena - Av. João Pinheiro',
          'Colégio Sagrado Coração de Jesus - Funcionários',
          'EE Barão do Rio Branco',
          'Colégio Arnaldo - Funcionários',
          'EM Bernardo Monteiro',
        ],
        streetList: [
          'Rua Fernandes Tourinho, 1020',
          'Rua Pernambuco, 880',
          'Rua Goiás, 200',
          'Rua Lavras, 225',
          'Av. João Pinheiro, 450',
          'Rua Paraiba, 1320',
          'Av. Getúlio Vargas, 910',
          'Praça João Pessoa, 200',
          'Av. Afonso Pena, 1980',
        ],
      },
      {
        bairro: 'Lourdes / Belvedere / Sion',
        zona: 27,
        center: [-19.9545, -43.9465],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.013,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 15.6,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Loyola - Cidade Jardim',
          'Colégio Bernoulli - Lourdes',
          'Colégio Santa Dorotéia - Sion',
          'EE Pandiá Calógeras - Santo Agostinho',
          'EM Governador Ozanan Coelho - Belvedere',
          'Colégio Santo Agostinho - BH',
        ],
        streetList: [
          'Av. do Contorno, 7919',
          'Rua Gonçalves Dias, 1920',
          'Av. Nossa Senhora do Carmo, 1450',
          'Praça Carlos Chagas, 35',
          'Av. Luiz Paulo Franco, 610',
          'Rua dos Aimorés, 2700',
        ],
      },
      {
        bairro: 'Padre Eustáquio / Carlos Prates / Caiçara',
        zona: 29,
        center: [-19.9125, -43.9765],
        spreadDeg: 0.018,
        maxCellRadiusDeg: 0.014,
        schoolsCount: 9,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 6.8,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'Colégio Padre Eustáquio',
          'EE Pedro II - Carlos Prates',
          'CEFET-MG - Campus I Nova Suíça',
          'EM Helena Antipoff - Caiçara',
          'EE Dom Cabral - Coração Eucarístico',
          'PUC Minas - Prédio 4 Coração Eucarístico',
          'EE Professor Morais - Prado',
          'EM Aires da Mata Machado',
          'Colégio Magnum Agostiniano',
        ],
        streetList: [
          'Rua Padre Eustáquio, 2380',
          'Rua Padre Marinho, 410',
          'Av. Amazonas, 5253',
          'Rua Rosinha Sigaud, 620',
          'Av. Dom José Gaspar, 500',
          'Rua Conde Pereira Carneiro, 320',
          'Rua Platina, 980',
          'Av. Pedro II, 2810',
          'Av. Presidente Carlos Luz, 850',
        ],
      },
      {
        bairro: 'Santa Tereza / Floresta / Sagrada Família',
        zona: 28,
        center: [-19.9115, -43.9165],
        spreadDeg: 0.017,
        maxCellRadiusDeg: 0.013,
        schoolsCount: 8,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 6.4,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'Colégio Tiradentes - Santa Tereza',
          'Colégio Batista Mineiro - Floresta',
          'EE Francisco Sales - Santa Efigênia',
          'EM Levindo Lopes - Sagrada Família',
          'Colégio Santa Maria - Cidade Nova',
          'EE Maestro Villa-Lobos',
          'EM Wenceslau Braz - Horto',
          'EE Ordem e Progresso',
        ],
        streetList: [
          'Praça Duque de Caxias, 120',
          'Rua Ponte Nova, 540',
          'Av. Brasil, 410',
          'Rua Conselheiro Lafaiete, 1120',
          'Av. Cristiano Machado, 1680',
          'Rua Pouso Alegre, 910',
          'Rua Silvianópolis, 340',
          'Rua Jacuí, 1450',
        ],
      },
      {
        bairro: 'Venda Nova / Pampulha Norte',
        zona: 36,
        center: [-19.8245, -43.9615],
        spreadDeg: 0.025,
        maxCellRadiusDeg: 0.02,
        schoolsCount: 9,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.8,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EM Dom Bosco - Venda Nova',
          'EE Geraldo Teixeira da Costa',
          'EM Professor Moacyr Andrade - Mantiqueira',
          'EE Presidente Tancredo Neves - Céu Azul',
          'EM Milton Campos - Piratininga',
          'EE Dona Augusta Gonçalves - Santa Mônica',
          'EM Jardim Felicidade - Norte',
          'EE José Heilbuth Gonçalves',
          'EM Professora Alice Nacif',
        ],
        streetList: [
          'Av. Vilarinho, 1980',
          'Rua Padre Pedro Pinto, 1450',
          'Rua Érico Veríssimo, 820',
          'Av. Portugal, 2910',
          'Av. Dom Pedro I, 1890',
          'Rua Ministro Oliveira Salazar, 410',
          'Av. Cristiano Machado, 8900',
          'Rua Dr. Álvaro Camargos, 1120',
          'Rua Boaventura, 640',
        ],
      },
      {
        bairro: 'Barreiro / Lindeia',
        zona: 33,
        center: [-19.9785, -44.0185],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 9,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.7,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EE Dona Maria de Oliveira - Barreiro',
          'Colégio Santa Rita - Barreiro de Baixo',
          'EM Dinorah Magalhães Fabri',
          'EE Clóvis Salgado - Milionários',
          'EM Vila Pinho - Vale do Jatobá',
          'EE Desembargador Rodrigues Campos',
          'EM Pedro Nava - Lindeia',
          'EE Celso Machado - Tirol',
          'PUC Minas - Campus Barreiro',
        ],
        streetList: [
          'Av. Sinfrônio Brochado, 840',
          'Av. Afonso Vaz de Melo, 1200',
          'Av. Olinto Meireles, 1850',
          'Rua Deputado Álvaro Sales, 410',
          'Av. Waldyr Soeiro Emrich, 3100',
          'Rua Visconde de Ibituruna, 310',
          'Av. Tereza Cristina, 6800',
          'Rua Cabo Valério Santos, 220',
          'Av. Afonso Vaz de Melo, 640',
        ],
      },
    ],
  },

  // ==================== 4. RECIFE (PE) — 42 Setores ====================
  {
    id: 'Recife',
    label: 'Recife',
    uf: 'PE',
    regiao: 'Nordeste',
    center: [-8.062, -34.905],
    zoom: 12,
    teve_2t_governador: true,
    contexto_palanque: '2º Turno Estadual Ativo (PE)',
    descricao_curta:
      'Queda maciça de abstenção no Ibura, Casa Amarela e Afogados combinada à herança da 3ª via nas Graças/Boa Vista.',
    clusters: [
      {
        bairro: 'Boa Vista / Graças / Derby',
        zona: 1,
        center: [-8.0555, -34.8925],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.013,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 6.4,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'Ginásio Pernambucano - Rua da Aurora',
          'Colégio Nóbrega - Boa Vista',
          'Colégio Damas - Graças',
          'EREM Sizenando Silveira',
          'Colégio São Luís - Espinheiro',
          'UNICAP - Bloco G Boa Vista',
          'EE Oliveira Lima - São José',
          'Colégio Agnes Erskine - Graças',
          'EREM Parque da Jaqueira',
          'Escola Politécnica de Pernambuco - Madalena',
        ],
        streetList: [
          'Rua da Aurora, 703',
          'Av. Conde da Boa Vista, 920',
          'Av. Rui Barbosa, 1426',
          'Rua do Hospício, 410',
          'Rua Conselheiro Portela, 520',
          'Rua do Príncipe, 526',
          'Praça Dom Vital, 110',
          'Av. Rosa e Silva, 890',
          'Rua do Futuro, 410',
          'Praça Internacional, 455',
        ],
      },
      {
        bairro: 'Boa Viagem / Pina',
        zona: 6,
        center: [-8.1195, -34.8995],
        spreadDeg: 0.019,
        maxCellRadiusDeg: 0.015,
        schoolsCount: 10,
        faixa_renda: 'acima_10sm',
        renda_sm: 10.8,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'EE Santos Dumont - Boa Viagem',
          'Colégio Santa Maria - Boa Viagem',
          'EREM Othon Paraíso - Pina',
          'Colégio Boa Viagem - CBV',
          'EM Oswaldo Lima Filho - Ipsep',
          'Colégio Motivo - Setúbal',
          'EE Virgem Poderosa - Imbiribeira',
          'EM Antônio Heráclio do Rêgo',
          'Colégio GGE - Boa Viagem',
          'EE Aníbal Fernandes - Setúbal',
        ],
        streetList: [
          'Rua Barão de Souza Leão, 540',
          'Rua Padre Bernardino Pessoa, 512',
          'Av. Herculano Bandeira, 620',
          'Rua Professor Eduardo Wanderley Filho, 539',
          'Av. Recife, 2810',
          'Rua Sá e Souza, 910',
          'Av. Mascarenhas de Morais, 3120',
          'Av. Domingos Ferreira, 2410',
          'Rua Baltazar Passos, 380',
          'Av. Conselheiro Aguiar, 3910',
        ],
      },
      {
        bairro: 'Casa Amarela / Santo Amaro',
        zona: 4,
        center: [-8.0245, -34.9185],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.016,
        schoolsCount: 11,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.5,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EREM Padre Machado - Casa Amarela',
          'EE Silva Jardim - Monteiro',
          'EM Dom Bosco - Morro da Conceição',
          'EREM Aníbal Falcão - Vasco da Gama',
          'IEP - Instituto de Educação de Pernambuco',
          'EE Regueira Costa - Água Fria',
          'EM Alto do Pascoal',
          'EREM Joaquim Távora - Tamarineira',
          'EE Frei Jaboatão - Arruda',
          'EM Nova Descoberta',
          'EE Dom Vital - Casa Forte',
        ],
        streetList: [
          'Estrada do Arraial, 3210',
          'Av. Norte Miguel Arraes, 4900',
          'Praça da Conceição, 180',
          'Rua Vasco da Gama, 640',
          'Av. João de Barros, 1180',
          'Av. Beberibe, 2410',
          'Rua Córrego do Euclides, 310',
          'Estrada das Ubaias, 510',
          'Av. Professor José dos Anjos, 980',
          'Rua Nova Descoberta, 1410',
          'Praça de Casa Forte, 360',
        ],
      },
      {
        bairro: 'Ibura / Afogados / Várzea',
        zona: 8,
        center: [-8.0965, -34.9485],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 11,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.6,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EE Jordão Emerenciano - Ibura',
          'EREM Professor Candido Duarte - Apipucos',
          'EE Presidente Humberto Castelo Branco - Ibura',
          'EM Engenheiro Henoch Coutinho - Cohab',
          'EE São Francisco de Assis - Afogados',
          'IFPE - Campus Recife Cidade Universitária',
          'EREM Escritor José de Alencar - Mustardinha',
          'EE Dom Miguel de Lima Valverde - Barro',
          'EM Vila dos Milagres - Ibura',
          'EE Brigadeiro Eduardo Gomes - Jardim São Paulo',
          'UFPE - Centro de Artes e Comunicação (Várzea)',
        ],
        streetList: [
          'Av. Dois Rios, 910',
          'Rua Rio Solimões, 420',
          'Ladeira da Cohab, 1120',
          'Estrada dos Remédios, 1890',
          'Av. Prof. Moraes Rego, 1235',
          'Rua Manoel Gonçalves da Luz, 340',
          'Av. Dr. José Rufino, 2610',
          'Rua Rio Xingu, 180',
          'Av. Liberdade, 920',
          'Av. Eng. Abdias de Carvalho, 1780',
          'Av. da Arquitetura, s/n',
        ],
      },
    ],
  },

  // ==================== 5. SALVADOR (BA) — 40 Setores ====================
  {
    id: 'Salvador',
    label: 'Salvador',
    uf: 'BA',
    regiao: 'Nordeste',
    center: [-12.965, -38.465],
    zoom: 12,
    teve_2t_governador: true,
    contexto_palanque: '2º Turno Estadual Ativo (BA)',
    descricao_curta:
      'Forte mobilização popular em Cajazeiras, Subúrbio Ferroviário e Cabula, com conversão de votos brancos e nulos.',
    clusters: [
      {
        bairro: 'Pituba / Barra / Graça',
        zona: 5,
        center: [-12.9995, -38.4785],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.016,
        schoolsCount: 10,
        faixa_renda: 'acima_10sm',
        renda_sm: 10.6,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'CE Manoel Devoto - Pituba',
          'Colégio Antônio Vieira - Garcia',
          'Colégio Marista Patamares',
          'CE Deputado Manoel Novaes - Canela',
          'Colégio Sartre COC - Itaigara',
          'UFBA - Faculdade de Direito (Graça)',
          'CE Odorico Tavares - Vitória',
          'Colégio Anchieta - Pituba',
          'EM Parque da Cidade',
          'CE Thales de Azevedo - Costa Azul',
        ],
        streetList: [
          'Rua Ceará, 610',
          'Av. Leovigildo Filgueiras, 683',
          'Av. Octávio Mangabeira, 3400',
          'Av. Araújo Pinho, 280',
          'Av. ACM, 2410',
          'Rua da Paz, s/n',
          'Av. Sete de Setembro, 1890',
          'Praça Nossa Senhora da Luz, 410',
          'Av. Paulo VI, 1120',
          'Rua Adelaide Fernandes da Costa, 510',
        ],
      },
      {
        bairro: 'Caminho das Árvores / Horto',
        zona: 7,
        center: [-12.9825, -38.4525],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.013,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 14.1,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Panamericano - Patamares / Caminho das Árvores',
          'Colégio Gregor Mendel - Pituba Norte',
          'CE Raphael Serravalle - Pituba',
          'Colégio Modulo - Caminho das Árvores',
          'UNIFACS - Campus Tancredo Neves',
          'Colégio Bernoulli - Caminho das Árvores',
        ],
        streetList: [
          'Alameda das Espatódeas, 540',
          'Rua Guillard Muniz, 720',
          'Av. Tancredo Neves, 1480',
          'Alameda das Catabas, 210',
          'Av. Waldemar Falcão, 1120',
          'Rua Alceu Amoroso Lima, 490',
        ],
      },
      {
        bairro: 'Cabula / Brotas / Liberdade',
        zona: 11,
        center: [-12.9525, -38.4725],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.016,
        schoolsCount: 12,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.8,
        profile: 'blank_null_conversion',
        schoolPrefixList: [
          'CE Governador Roberto Santos - Cabula',
          'ICEIA - Instituto Central de Educação Isaías Alves',
          'CE Duque de Caxias - Liberdade',
          'UNEB - Campus I Cabula',
          'CE Luiz Viana - Brotas',
          'CE Carneiro Ribeiro - Caixa D’Água',
          'EM Permínio Leite - Matatu',
          'CE Heitor Villa-Lobos - Cabula VI',
          'CE Severino Vieira - Nazaré',
          'CE Presidente Costa e Silva - Ribeira',
          'CE Luiz Tarquínio - Boa Viagem / Roma',
          'EM Padre Vieira - Pernambués',
        ],
        streetList: [
          'Rua Silveira Martins, 2550',
          'Largo do Barbalho, s/n',
          'Estrada da Liberdade, 910',
          'Rua Silveira Martins, 3100',
          'Av. Dom João VI, 1420',
          'Rua Saldanha Marinho, 410',
          'Rua Barros Falcão, 620',
          'Rua Teódulo de Albuquerque, 540',
          'Boulevard América, 85',
          'Av. Beira Mar, 410',
          'Av. Dendezeiros do Bonfim, 180',
          'Rua Thomaz Gonzaga, 920',
        ],
      },
      {
        bairro: 'Cajazeiras / Subúrbio Ferroviário',
        zona: 14,
        center: [-12.8985, -38.4265],
        spreadDeg: 0.026,
        maxCellRadiusDeg: 0.021,
        schoolsCount: 12,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.5,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'CE Dona Mora Guimarães - Cajazeiras X',
          'CE Deputado Naomar Alcântara - Cajazeiras V',
          'CE Edgard Santos - Fazenda Grande II',
          'CE Almirante Barroso - Paripe',
          'CE Lomanto Júnior - Itapuã',
          'EM São Marcos - Pau da Lima',
          'CE Plataforma - Subúrbio',
          'CE Sete de Setembro - Periperi',
          'EM Castelo Branco - Castelo Branco',
          'CE Marechal Mascarenhas de Moraes - Mussurunga',
          'CE Rotary - Itapuã',
          'EM Boca da Mata',
        ],
        streetList: [
          'Estrada do Coqueiro Grande, 1420',
          'Estrada da Paciência, 890',
          'Via Regional, 2100',
          'Av. Afrânio Peixoto, 4200',
          'Av. Dorival Caymmi, 1180',
          'Av. São Rafael, 1450',
          'Praça São Braz, 120',
          'Rua Doutor Almeida, 310',
          'Via Castelo Branco, 910',
          'Setor C Mussurunga I, s/n',
          'Ladeira do Abaeté, 210',
          'Estrada Velha do Aeroporto, 3400',
        ],
      },
    ],
  },

  // ==================== 6. PORTO ALEGRE (RS) — 36 Setores ====================
  {
    id: 'Porto Alegre',
    label: 'Porto Alegre',
    uf: 'RS',
    regiao: 'Sul',
    center: [-30.045, -51.195],
    zoom: 12,
    teve_2t_governador: true,
    contexto_palanque: '2º Turno Estadual Ativo (RS)',
    descricao_curta:
      'Herança da 3ª via na Cidade Baixa e Bom Fim, sangria no Menino Deus e queda de abstenção na Restinga e Rubem Berta.',
    clusters: [
      {
        bairro: 'Cidade Baixa / Bom Fim / Centro',
        zona: 1,
        center: [-30.0345, -51.2165],
        spreadDeg: 0.015,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 7.6,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'Escola Técnica Estadual Parobé',
          'Instituto de Educação General Flores da Cunha',
          'Colégio Estadual Júlio de Castilhos (Julinho)',
          'UFRGS - Campus Centro',
          'Colégio Militar de Porto Alegre - Redenção',
          'EE Paula Soares - Centro Histórico',
          'Colégio Marista Rosário',
          'EE Rio Branco - Bom Fim',
          'EMEF Porto Alegre - Cidade Baixa',
          'EE Infante Dom Henrique',
        ],
        streetList: [
          'Av. Loureiro da Silva, 945',
          'Av. Osvaldo Aranha, 527',
          'Av. Piratini, 76',
          'Av. Paulo Gama, 110',
          'Av. José Bonifácio, 363',
          'Rua General Auto, 68',
          'Praça Dom Sebastião, 2',
          'Av. Protásio Alves, 480',
          'Rua da República, 410',
          'Av. Venâncio Aires, 910',
        ],
      },
      {
        bairro: 'Moinhos de Vento / Bela Vista',
        zona: 2,
        center: [-30.0265, -51.1965],
        spreadDeg: 0.015,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 14.8,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Anchieta - Três Figueiras',
          'Colégio Farroupilha - Chácara das Pedras',
          'Colégio Leonardo da Vinci - Beta',
          'EE Uruguai - Moinhos de Vento',
          'Colégio Metodista Americano - Rio Branco',
          'PUCRS - Prédio 15 Partenon',
        ],
        streetList: [
          'Av. Nilo Peçanha, 1521',
          'Rua Carlos Huber, 425',
          'Rua 24 de Outubro, 820',
          'Rua Mostardeiro, 410',
          'Rua Dr. Lauro de Oliveira, 71',
          'Av. Ipiranga, 6681',
        ],
      },
      {
        bairro: 'Menino Deus / Zona Norte (Passo d’Areia)',
        zona: 111,
        center: [-30.0565, -51.2145],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.016,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 8.2,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'CE Presidente Arthur da Costa e Silva - Menino Deus',
          'Colégio João XXIII - Santa Cecília',
          'EE Dom Diogo de Souza - Cristo Redentor',
          'Colégio La Salle São João',
          'EE Padre Rambo - Partenon',
          'CE Cândido José de Godói - Navegantes',
          'EE Brasil - Azenha',
          'Colégio Marista Assunção - Tristeza',
          'EE Santos Dumont - Assunção',
          'EMEF Leocádia Felizardo Prestes',
        ],
        streetList: [
          'Av. Getúlio Vargas, 1290',
          'Rua Ramiro Barcelos, 2410',
          'Av. Assis Brasil, 3420',
          'Rua Honório Silveira Dias, 645',
          'Av. Bento Gonçalves, 2810',
          'Av. Sertório, 1120',
          'Av. Érico Veríssimo, 890',
          'Av. Wenceslau Escobar, 2100',
          'Av. Otto Niemeyer, 1450',
          'Rua José de Alencar, 610',
        ],
      },
      {
        bairro: 'Restinga / Lomba do Pinheiro / Rubem Berta',
        zona: 113,
        center: [-30.1245, -51.1325],
        spreadDeg: 0.026,
        maxCellRadiusDeg: 0.021,
        schoolsCount: 10,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.7,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EMEF Senador Alberto Pasqualini - Restinga',
          'IFRS - Campus Restinga',
          'EMEF Afonso Guerreiro Lima - Lomba do Pinheiro',
          'EE Francisco Antônio Vieira Caldas Júnior',
          'EMEF Grande Oriente do Rio Grande do Sul - Rubem Berta',
          'EE Rafaela Remião - Lomba do Pinheiro',
          'EMEF Mário Quintana - Restinga Nova',
          'EE Júlio César Ribeiro de Souza',
          'EMEF Saint-Hilaire',
          'CE Alberto Torres - Sarandi',
        ],
        streetList: [
          'Av. João Antônio da Silveira, 1850',
          'Rua Alberto Hoffmann, 285',
          'Estrada João de Oliveira Remião, 4500',
          'Av. Baltazar de Oliveira Garcia, 3900',
          'Rua Wolfram Metzler, 610',
          'Estrada Chácara do Banco, 910',
          'Av. Economista Nilo Wulff, 1120',
          'Av. Edgar Pires de Castro, 2400',
          'Rua Adelino Ferreira Jardim, 420',
          'Av. Assis Brasil, 6800',
        ],
      },
    ],
  },

  // ==================== 7. CURITIBA (PR) — 36 Setores ====================
  {
    id: 'Curitiba',
    label: 'Curitiba',
    uf: 'PR',
    regiao: 'Sul',
    center: [-25.442, -49.275],
    zoom: 12,
    teve_2t_governador: false,
    contexto_palanque: 'Governador Definido no 1º Turno (PR)',
    descricao_curta:
      'Sangria direta de Flávio no Água Verde e Centro Cívico, migração da 3ª via na CIC e avanço de Flávio no Batel/Ecoville.',
    clusters: [
      {
        bairro: 'Centro Cívico / Água Verde / Rebouças',
        zona: 1,
        center: [-25.4325, -49.2715],
        spreadDeg: 0.017,
        maxCellRadiusDeg: 0.014,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 8.9,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'Colégio Estadual do Paraná - Alto da Glória',
          'UTFPR - Campus Curitiba Rebouças',
          'Instituto de Educação do Paraná - Erasmo Piloto',
          'CE Rio Branco - Água Verde',
          'Colégio Bom Jesus - Centro',
          'UFPR - Prédio Histórico Praça Santos Andrade',
          'CE Tiradentes - Centro Cívico',
          'Colégio Marista Paranaense',
          'CE Dezenove de Dezembro',
          'CE Xavier da Silva - Silva Jardim',
        ],
        streetList: [
          'Av. João Gualberto, 250',
          'Av. Sete de Setembro, 3165',
          'Rua Emiliano Perneta, 920',
          'Av. República Argentina, 1890',
          'Rua 24 de Maio, 135',
          'Praça Santos Andrade, 50',
          'Praça 19 de Dezembro, 110',
          'Av. Bispo Dom José, 2674',
          'Rua Amintas de Barros, 510',
          'Av. Silva Jardim, 1420',
        ],
      },
      {
        bairro: 'Batel / Ecoville / Bigorrilho',
        zona: 2,
        center: [-25.4415, -49.3085],
        spreadDeg: 0.017,
        maxCellRadiusDeg: 0.014,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 15.2,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Positivo - Ângelo Sampaio / Batel',
          'Universidade Positivo - Ecoville',
          'CE Pedro Macedo - Portão / Água Verde',
          'Colégio Dom Bosco - Batel',
          'EM Professora Maria Nicolas - Bigorrilho',
          'Colégio Sion - Batel',
        ],
        streetList: [
          'Av. Sete de Setembro, 4214',
          'Rua Prof. Pedro Viriato Parigot de Souza, 5300',
          'Av. República Argentina, 2890',
          'Av. Visconde de Guarapuava, 4800',
          'Rua Padre Anchieta, 1980',
          'Alameda Presidente Taunay, 450',
        ],
      },
      {
        bairro: 'Cidade Industrial (CIC) / Fazendinha',
        zona: 175,
        center: [-25.4985, -49.3285],
        spreadDeg: 0.022,
        maxCellRadiusDeg: 0.018,
        schoolsCount: 10,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.8,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'CE Ivo Leão - Cidade Industrial (CIC)',
          'CE Padre Cláudio Morelli - Fazendinha',
          'EM Prefeito Omar Sabbag - CIC',
          'CE Hildebrando de Araújo - Campo Comprido',
          'CE Dirce Celestino do Amaral',
          'EM Albert Schweitzer - Vila Nossa Senhora da Luz',
          'CE São Paulo Apóstolo - Uberaba',
          'CE Pinheiro do Paraná - Santa Felicidade',
          'EM Papa João XXIII - Portão',
          'CE Barão do Rio Branco - Boqueirão',
        ],
        streetList: [
          'Rua Des. Cid Campelo, 4120',
          'Rua Carlos Klemtz, 1450',
          'Rua João Bettega, 3900',
          'Rua Eduardo Sprada, 2100',
          'Rua Léa Moreira de Souza Moura, 410',
          'Rua Davi Xavier da Silva, 680',
          'Av. Senador Salgado Filho, 3400',
          'Av. Manoel Ribas, 4800',
          'Rua Itacolomi, 920',
          'Av. Marechal Floriano Peixoto, 6400',
        ],
      },
      {
        bairro: 'Sítio Cercado / Pinheirinho / Tatuquara',
        zona: 177,
        center: [-25.5425, -49.2765],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 10,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.9,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'CE Prof. Lysímaco Ferreira da Costa - Sítio Cercado',
          'CE João Paulo II - Sítio Cercado',
          'CE Júlia Wanderley - Pinheirinho',
          'EM Bairro Novo do CAIC',
          'CE Beatriz Faria Ansay - Tatuquara',
          'EM Dona Pompília - Tatuquara',
          'CE Maria Gai Grendel - Xaxim',
          'CE Eurípides Garcez do Nascimento',
          'EM Madre Maria dos Anjos - Capão Raso',
          'CE São Braz - Cajuru',
        ],
        streetList: [
          'Rua Izaac Ferreira da Cruz, 3210',
          'Rua São José dos Pinhais, 980',
          'Av. Winston Churchill, 2100',
          'Rua Tijucas do Sul, 1420',
          'Rua Enette Dubard, 610',
          'Rua Jovenilson Américo de Oliveira, 340',
          'Rua Francisco Derosso, 2810',
          'Rua Delegado Leopoldo Belczak, 1890',
          'Av. Brasília, 5400',
          'Rua Engenheiro Costa Barros, 1120',
        ],
      },
    ],
  },

  // ==================== 8. BRASÍLIA (DF) — 36 Setores ====================
  {
    id: 'Brasilia',
    label: 'Brasília',
    uf: 'DF',
    regiao: 'Centro-Oeste',
    center: [-15.805, -47.945],
    zoom: 11,
    teve_2t_governador: false,
    contexto_palanque: 'Governador Definido no 1º Turno (DF)',
    descricao_curta:
      'Herança da 3ª via na Asa Norte, sangria em Taguatinga, mobilização em Ceilândia/Samambaia e crescimento de Flávio no Lago Sul.',
    clusters: [
      {
        bairro: 'Asa Norte / Asa Sul (Plano Piloto)',
        zona: 1,
        center: [-15.7815, -47.8865],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 10,
        faixa_renda: 'acima_10sm',
        renda_sm: 15.1,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'CEM Elefante Branco - Asa Sul 908',
          'CEM Setor Leste - 611 Sul',
          'CEM Paulo Freire - 610 Norte',
          'UnB - Pavilhão Anísio Teixeira (Asa Norte)',
          'Colégio Marista de Brasília - 615 Sul',
          'CEM Asa Norte - CEAN 604 Norte',
          'Colégio Militar de Brasília - 902 Norte',
          'CEF Caseb - 909 Sul',
          'Colégio Leonardo da Vinci - 914 Norte',
          'CEF Polivalente - 913 Sul',
        ],
        streetList: [
          'SGAS 908 Conjunto A',
          'SGAS 611 Módulo D',
          'SGAN 610 Módulo B',
          'Campus Universitário Darcy Ribeiro',
          'SGAS 615 Módulo C',
          'SGAN 604 Módulo A',
          'SGAN 902 Conjunto F',
          'SGAS 909 Módulo B',
          'SGAN 914 Conjunto G',
          'SGAS 913 Conjunto D',
        ],
      },
      {
        bairro: 'Lago Sul / Sudoeste',
        zona: 14,
        center: [-15.8345, -47.8785],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.016,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 19.2,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'CEM Setor Sudoeste - QMSW 5',
          'Colégio Mackenzie Brasília - Lago Sul',
          'CEF 01 do Lago Sul - SHIS QI 15',
          'Colégio Olimpo - Cruzeiro / Sudoeste',
          'Gilberto Salomão Centro Educacional - QI 5',
          'CEM 01 do Cruzeiro Novo',
        ],
        streetList: [
          'QMSW 5 Lote 4 - Sudoeste',
          'SHIS QI 5 Chácara 74 - Lago Sul',
          'SHIS QI 15 Área Especial - Lago Sul',
          'CCSW 4 Lote 2 - Sudoeste',
          'SHIS QI 7 Área Especial',
          'SHCES Quadra 905 - Cruzeiro',
        ],
      },
      {
        bairro: 'Taguatinga / Águas Claras / Guará',
        zona: 8,
        center: [-15.8265, -48.0365],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 6.4,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'CEM Escola Industrial de Taguatinga (EIT)',
          'CEM Taguatinga Norte (CEMTN)',
          'Colégio La Salle - Águas Claras',
          'CEM Ave Branca (CEMAB) - Taguatinga Sul',
          'GG - Centro de Ensino Médio 01 do Guará',
          'Universidade Católica de Brasília - Taguatinga',
          'CEM 02 do Guará II',
          'Colégio Ideal - Taguatinga Norte',
          'CEF 10 de Taguatinga',
          'Centro Universitário Euro-Americano - Águas Claras',
        ],
        streetList: [
          'QNA 45 Área Especial - Taguatinga',
          'QNG Área Especial 39',
          'Quadra 301 Conjunto 2 - Águas Claras',
          'CSA 3 Área Especial - Taguatinga Sul',
          'QE 7 Área Especial - Guará I',
          'QS 07 Lote 01 - Pistão Sul',
          'QE 26 Área Especial - Guará II',
          'QNJ 28 Área Especial',
          'QNL 13 Área Especial',
          'Av. das Castanheiras, 3200',
        ],
      },
      {
        bairro: 'Ceilândia / Samambaia',
        zona: 12,
        center: [-15.8385, -48.1085],
        spreadDeg: 0.026,
        maxCellRadiusDeg: 0.021,
        schoolsCount: 10,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.9,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'CEM 03 de Ceilândia Sul',
          'CEM 09 de Ceilândia Norte',
          'CEM 414 de Samambaia Norte',
          'CEF 07 de Ceilândia - Guariroba',
          'CEM 304 de Samambaia Sul',
          'IFB - Campus Ceilândia',
          'CEM 12 de Ceilândia - P Sul',
          'CEF 24 de Ceilândia - Expansão do Setor O',
          'CEM 01 de Sobradinho',
          'CEM 02 de Planaltina',
        ],
        streetList: [
          'QNM 13 Área Especial - Ceilândia',
          'QNN 19 Área Especial',
          'QN 414 Conjunto A - Samambaia',
          'QNN 24 Área Especial - Guariroba',
          'QS 304 Área Especial - Samambaia',
          'QNN 26 Área Especial',
          'QNP 15 Área Especial - P Sul',
          'QNO 18 Área Especial - Setor O',
          'Quadra 4 Área Especial - Sobradinho',
          'Setor Educacional - Planaltina',
        ],
      },
    ],
  },

  // ==================== 9. FORTALEZA (CE) — 34 Setores ====================
  {
    id: 'Fortaleza',
    label: 'Fortaleza',
    uf: 'CE',
    regiao: 'Nordeste',
    center: [-3.755, -38.535],
    zoom: 12,
    teve_2t_governador: false,
    contexto_palanque: 'Governador Definido no 1º Turno (CE)',
    descricao_curta:
      'Queda de abstenção na Barra do Ceará e Messejana, herança da 3ª via na Aldeota/Benfica e avanço de Flávio no Meireles.',
    clusters: [
      {
        bairro: 'Aldeota / Meireles / Benfica',
        zona: 1,
        center: [-3.7385, -38.5165],
        spreadDeg: 0.019,
        maxCellRadiusDeg: 0.015,
        schoolsCount: 11,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 8.6,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'EEM Justiniano de Serpa - Centro / Aldeota',
          'UFC - Centro de Humanidades Benfica',
          'Colégio Ari de Sá Cavalcante - Washington Soares',
          'Liceu do Ceará - Jacarecanga',
          'Colégio Christus - Aldeota',
          'IFCE - Campus Fortaleza treze de Maio',
          'Colégio 7 de Setembro - Aldeota',
          'EEM Paulo Petrola - Praia do Futuro',
          'Colégio Farias Brito - Seis Bocas',
          'EEFM Estado do Amazonas - Fátima',
          'Colégio Militar de Fortaleza',
        ],
        streetList: [
          'Av. Santos Dumont, 1450',
          'Av. da Universidade, 2853',
          'Av. Heráclito Graça, 826',
          'Praça Gustavo Barroso, s/n',
          'Rua João Carvalho, 630',
          'Av. Treze de Maio, 2081',
          'Av. Desembargador Moreira, 1600',
          'Av. Dioguinho, 3100',
          'Rua Salvador Correia de Sá, 1195',
          'Av. Aguanambi, 1890',
          'Av. Santos Dumont, 485',
        ],
      },
      {
        bairro: 'Meireles Orla / Cocó',
        zona: 2,
        center: [-3.7325, -38.4885],
        spreadDeg: 0.014,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 5,
        faixa_renda: 'acima_10sm',
        renda_sm: 13.8,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Santa Cecília - Aldeota / Meireles',
          'Colégio Antares - Papicu / Cocó',
          'UNIFOR - Bloco M Edson Queiroz',
          'EEFM Governador Flávio Marcílio - Mucuripe',
          'Colégio Santo Inácio - Desembargador Moreira',
        ],
        streetList: [
          'Av. Senador Virgílio Távora, 1020',
          'Rua Andrade Furtado, 1120',
          'Av. Washington Soares, 1321',
          'Av. Abolição, 3900',
          'Av. Padre Antônio Tomás, 2100',
        ],
      },
      {
        bairro: 'Messejana / Parangaba / Mondubim',
        zona: 3,
        center: [-3.8085, -38.5265],
        spreadDeg: 0.026,
        maxCellRadiusDeg: 0.021,
        schoolsCount: 9,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.5,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'Liceu de Messejana',
          'UECE - Campus Itaperi Parangaba',
          'EEMTI Prefeito José Walter',
          'EEFM Dom Helder Câmara - Messejana',
          'EEMTI Governador Adauto Bezerra',
          'EM Professora Terezinha Ferreira Parente',
          'EEFM Deputado Paulo Benevides - Messejana',
          'EEMTI Marechal Humberto Castelo Branco - Montese',
          'EEFM Ronald de Carvalho - Mondubim',
        ],
        streetList: [
          'Av. Washington Soares, 7700',
          'Av. Dr. Silas Munguba, 1700',
          'Av. L, 890 - Pref. José Walter',
          'Rua Padre Pedro de Alencar, 1420',
          'Rua Monsenhor Liberato, 1850',
          'Rua Frei Odilon, 540',
          'Av. Jornalista Tomaz Coelho, 910',
          'Rua Alberto Magno, 620',
          'Av. Bernardo Manuel, 8400',
        ],
      },
      {
        bairro: 'Barra do Ceará / Antônio Bezerra / Bom Jardim',
        zona: 82,
        center: [-3.7385, -38.5845],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 9,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.5,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EEMTI Polivalente Modelo de Fortaleza - Barra do Ceará',
          'EEFM Santo Amaro - Bom Jardim',
          'EEMTI Presidente Humberto Castelo Branco - Antônio Bezerra',
          'EEFM Poeta Patativa do Assaré - Granja Lisboa',
          'EM Francisco Domingos da Silva - Barra do Ceará',
          'EEFM São José dos Arpoadores',
          'EEMTI Paulo VI - Jardim América',
          'EEFM Heróis do Jenipapo - Genibaú',
          'EM Reitor Pedro Teixeira Barroso - Conjunto Ceará',
        ],
        streetList: [
          'Av. Presidente Castelo Branco, 4800',
          'Rua Oscar França, 1120 - Bom Jardim',
          'Av. Mister Hull, 4210',
          'Rua Bom Jesus, 1980',
          'Av. Radialista José Lima Verde, 840',
          'Av. Coronel Carvalho, 2410',
          'Rua Jorge Dumar, 1420',
          'Av. Senador Fernandes Távora, 3100',
          'Av. Central, 980 - Conjunto Ceará',
        ],
      },
    ],
  },

  // ==================== 10. MANAUS (AM) — 32 Setores ====================
  {
    id: 'Manaus',
    label: 'Manaus',
    uf: 'AM',
    regiao: 'Norte',
    center: [-3.085, -59.995],
    zoom: 12,
    teve_2t_governador: true,
    contexto_palanque: '2º Turno Estadual Ativo (AM)',
    descricao_curta:
      'Queda de abstenção decisiva na Cidade Nova e Zona Leste (Jorge Teixeira), com sangria de Flávio em Adrianópolis/Parque 10.',
    clusters: [
      {
        bairro: 'Adrianópolis / Parque 10 / Centro',
        zona: 1,
        center: [-3.1025, -60.0125],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.016,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 7.2,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'Colégio Amazonense Dom Pedro II - Centro',
          'Instituto de Educação do Amazonas (IEA)',
          'EE Solon de Lucena - Praça 14 / Boulevard',
          'Colégio La Salle - Dom Pedro',
          'UEA - Escola Normal Superior Djalma Batista',
          'EE Marechal Hermes - Parque 10',
          'Colégio Santa Dorotéia - Centro',
          'EE Luizinha Nascimento - Praça 14',
          'UFAM - Setor Norte Coroado',
          'EE Nossa Senhora Aparecida',
        ],
        streetList: [
          'Av. Sete de Setembro, 1190',
          'Rua Ramos Ferreira, 840',
          'Av. Constantino Nery, 1420',
          'Av. Dom Pedro I, 151',
          'Av. Djalma Batista, 2470',
          'Av. Tancredo Neves, 980',
          'Av. Joaquim Nabuco, 1120',
          'Rua Duque de Caxias, 610',
          'Av. Rodrigo Otávio, 6200',
          'Rua Bandeirantes, 310',
        ],
      },
      {
        bairro: 'Ponta Negra / Vieiralves',
        zona: 31,
        center: [-3.0785, -60.0685],
        spreadDeg: 0.018,
        maxCellRadiusDeg: 0.015,
        schoolsCount: 5,
        faixa_renda: 'acima_10sm',
        renda_sm: 12.9,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Militar de Manaus - Seções Ponta Negra',
          'Centro Educacional Século - Ponta Negra',
          'Colégio Martha Falcão - Adrianópolis',
          'EE Senador Evandro das Neves Carreira',
          'ULBRA Manaus - Av. Carlos Drummond',
        ],
        streetList: [
          'Estrada da Ponta Negra, 4800',
          'Av. Coronel Teixeira, 5120',
          'Rua Salvador, 455 - Vieiralves',
          'Av. Brasil, 2910 - Compensa',
          'Av. Carlos Drummond de Andrade, 1460',
        ],
      },
      {
        bairro: 'Cidade Nova / Novo Aleixo',
        zona: 58,
        center: [-3.0285, -59.9785],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 9,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 2.6,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EE Senador Petrônio Portella - Cidade Nova',
          'EE Dom Milton Corrêa Pereira - Cidade Nova III',
          'CETI Áurea Pinheiro Braga - Compensa',
          'EE Padre Luís Ruas - Novo Aleixo',
          'EM Prof. Waldir Garcia - São Geraldo',
          'EE Ribeiro da Cunha - Alvorada',
          'CETI Gilberto Mestrinho - Cachoeirinha',
          'EE Vasco Vasques - Flores',
          'EM Engenheiro João Alberto - Mutirão',
        ],
        streetList: [
          'Av. Noel Nutels, 1650',
          'Av. Max Teixeira, 2890',
          'Av. Camapuã, 1980',
          'Rua Comendador José Cruz, 540',
          'Av. Torquato Tapajós, 4100',
          'Av. Desembargador João Machado, 1120',
          'Av. Carvalho Leal, 1450',
          'Av. Timbiras, 910',
          'Av. Itaúba, 1890',
        ],
      },
      {
        bairro: 'Japiim / Jorge Teixeira / Zumbi',
        zona: 32,
        center: [-3.0895, -59.9465],
        spreadDeg: 0.024,
        maxCellRadiusDeg: 0.019,
        schoolsCount: 8,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.7,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EE Prof. Marco Antônio Vilaça - Japiim',
          'EE Antônio Lucena Bittencourt - Morro da Liberdade',
          'EE Tancredo Neves - São José Operário',
          'EM Dom Jacson Damasceno - Jorge Teixeira',
          'EE Roxana Pereira Bonessi - Zumbi dos Palmares',
          'CETI Elisa Bessa Freire - Jorge Teixeira',
          'EE Francisca Botinelly - Coroado',
          'EM Professora Sônia Maria - Distrito Industrial',
        ],
        streetList: [
          'Av. Rodrigo Otávio, 3120',
          'Rua São Benedito, 420',
          'Av. Autaz Mirim, 6400',
          'Av. Brigadeiro Hilário Gurjão, 1450',
          'Alameda Cosme Ferreira, 4800',
          'Av. Itaúba, 3900',
          'Av. Beira Mar, 920 - Coroado',
          'Av. Buriti, 2100',
        ],
      },
    ],
  },

  // ==================== 11. BELÉM (PA) — 30 Setores ====================
  {
    id: 'Belem',
    label: 'Belém',
    uf: 'PA',
    regiao: 'Norte',
    center: [-1.445, -48.472],
    zoom: 12,
    teve_2t_governador: false,
    contexto_palanque: 'Governador Definido no 1º Turno (PA)',
    descricao_curta:
      'Queda de abstenção no Guamá e Jurunas, conversão de brancos/nulos no Marco e Pedreira e 3ª via em Nazaré.',
    clusters: [
      {
        bairro: 'Nazaré / Batista Campos / Umarizal',
        zona: 1,
        center: [-1.4525, -48.4865],
        spreadDeg: 0.015,
        maxCellRadiusDeg: 0.012,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 7.9,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'Colégio Estadual Paes de Carvalho - Nazaré',
          'Instituto de Educação do Pará (IEP)',
          'Colégio Marista Nossa Senhora de Nazaré',
          'EE Magalhães Barata - São Brás',
          'Colégio Moderno - Batista Campos',
          'EE Barão do Rio Branco - Campina',
          'UNAMA - Campus Alcindo Cacela',
          'Colégio Gentil Bittencourt - Nazaré',
          'EE Deodoro de Mendonça',
          'Colégio Ideal - Batista Campos',
        ],
        streetList: [
          'Praça Saldanha Marinho, s/n',
          'Rua Gama Abreu, 256',
          'Av. Nazaré, 910',
          'Av. José Bonifácio, 540',
          'Travessa Quintino Bocaiúva, 1808',
          'Av. Generalíssimo Deodoro, 890',
          'Av. Alcindo Cacela, 287',
          'Av. Magalhães Barata, 310',
          'Av. Governador José Malcher, 1420',
          'Rua dos Mundurucus, 1980',
        ],
      },
      {
        bairro: 'Marco / Pedreira / Sacramenta',
        zona: 76,
        center: [-1.4285, -48.4645],
        spreadDeg: 0.018,
        maxCellRadiusDeg: 0.014,
        schoolsCount: 10,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 3.4,
        profile: 'blank_null_conversion',
        schoolPrefixList: [
          'EE Cordeiro de Farias - Marco',
          'UEPA - Centro de Ciências Sociais e Educação',
          'IFPA - Campus Belém Almirante Barroso',
          'EE Visconde de Souza Franco - Marco',
          'EE Pedro Amazonas Pedroso - Pedreira',
          'EE Vilhena Alves - São Brás',
          'EM Parque Amazônia - Terra Firme',
          'EE Mário Barbosa - Marambaia',
          'EE Jarbas Passarinho - Souza',
          'EE Justo Chermont - Pedreira',
        ],
        streetList: [
          'Av. Almirante Barroso, 2890',
          'Travessa Djalma Dutra, s/n',
          'Av. Almirante Barroso, 1155',
          'Av. João Paulo II, 910',
          'Av. Pedro Miranda, 1680',
          'Av. Governador Magalhães Barata, 1120',
          'Av. Perimetral, 1850',
          'Rodovia Augusto Montenegro, km 3',
          'Av. Marquês de Herval, 620',
          'Av. Senador Lemos, 2100',
        ],
      },
      {
        bairro: 'Guamá / Jurunas / Icoaraci',
        zona: 29,
        center: [-1.4685, -48.4665],
        spreadDeg: 0.02,
        maxCellRadiusDeg: 0.016,
        schoolsCount: 10,
        faixa_renda: 'ate_2sm',
        renda_sm: 1.6,
        profile: 'abstention_mobilization',
        schoolPrefixList: [
          'EE Barão de Igarapé-Miri - Guamá',
          'UFPA - Campus Básico Guamá',
          'EE Frei Daniel - Guamá',
          'EE Camilo Salgado - Jurunas',
          'EE Princesa Isabel - Cremação',
          'EE Acácio Felício Sobral - Condor',
          'EE Avertano Rocha - Icoaraci',
          'EM Manuela Freitas - Tapanã',
          'EE Padre Eduardo - Benguí',
          'EE Antônio Lemos - Cidade Velha',
        ],
        streetList: [
          'Av. José Bonifácio, 2140',
          'Rua Augusto Corrêa, 01',
          'Passagem Barão de Mamoré, 410',
          'Rua dos Timbiras, 980 - Jurunas',
          'Rua Fernando Guilhon, 1420',
          'Av. Bernardo Sayão, 2410',
          'Rua Padre Júlio Maria, 810',
          'Rodovia do Tapanã, 1290',
          'Estrada do Benguí, 910',
          'Av. Portugal, 340',
        ],
      },
    ],
  },

  // ==================== 12. GOIÂNIA (GO) — 30 Setores ====================
  {
    id: 'Goiania',
    label: 'Goiânia',
    uf: 'GO',
    regiao: 'Centro-Oeste',
    center: [-16.685, -49.265],
    zoom: 12,
    teve_2t_governador: false,
    contexto_palanque: 'Governador Definido no 1º Turno (GO)',
    descricao_curta:
      'Sangria direta de Flávio Bolsonaro no Setor Oeste, herança da 3ª via no Setor Universitário e avanço de Flávio no Setor Marista/Jardim Goiás.',
    clusters: [
      {
        bairro: 'Setor Bueno / Setor Oeste / Centro',
        zona: 1,
        center: [-16.6825, -49.2685],
        spreadDeg: 0.017,
        maxCellRadiusDeg: 0.014,
        schoolsCount: 10,
        faixa_renda: 'de_5_a_10sm',
        renda_sm: 8.8,
        profile: 'flavio_sangria',
        schoolPrefixList: [
          'CE Lyceu de Goiânia - Centro / Oeste',
          'Instituto de Educação de Goiás (IEG)',
          'Colégio Visão - Setor Bueno',
          'IFG - Campus Goiânia Rua 75',
          'Colégio Agostiniano Nossa Senhora de Fátima',
          'CE José Lobo - Setor Coimbra',
          'Colégio Integrado - Setor Oeste',
          'EM Jarbas Jayme - Setor Aeroporto',
          'CE Presidente Costa e Silva - Campinas',
          'Colégio Ateneu Dom Bosco - Setor Oeste',
        ],
        streetList: [
          'Rua 21, 10 - Centro',
          'Av. Anhanguera, 1630',
          'Av. T-1, 1890 - Setor Bueno',
          'Rua 75, 46 - Centro',
          'Av. K, 410 - Setor Aeroporto',
          'Praça Walter Santos, 120',
          'Rua 9, 1120 - Setor Oeste',
          'Av. República do Líbano, 1450',
          'Av. 24 de Outubro, 980',
          'Alameda dos Buritis, 485',
        ],
      },
      {
        bairro: 'Setor Marista / Jardim Goiás',
        zona: 127,
        center: [-16.7045, -49.2485],
        spreadDeg: 0.016,
        maxCellRadiusDeg: 0.013,
        schoolsCount: 6,
        faixa_renda: 'acima_10sm',
        renda_sm: 15.4,
        profile: 'flavio_grew_2t',
        schoolPrefixList: [
          'Colégio Marista de Goiânia - Setor Marista',
          'Colégio WR - Setor Bueno / Marista',
          'Colégio Olimpo - Setor Marista',
          'PUC Goiás - Área IV Jardim Goiás',
          'Colégio Externato São José',
          'CE Jardim América - Av. T-63',
        ],
        streetList: [
          'Av. 85, 1440 - Setor Marista',
          'Av. T-2, 910',
          'Rua 1128, 340 - Setor Marista',
          'Av. Jamel Cecílio, 2900',
          'Rua 18, 221 - Setor Oeste',
          'Av. T-63, 2410',
        ],
      },
      {
        bairro: 'Setor Universitário / Região Noroeste',
        zona: 2,
        center: [-16.6585, -49.2545],
        spreadDeg: 0.022,
        maxCellRadiusDeg: 0.018,
        schoolsCount: 14,
        faixa_renda: 'de_2_a_5sm',
        renda_sm: 3.6,
        profile: 'third_way_strong',
        schoolPrefixList: [
          'CE Prof. Pedro Gomes - Campinas / Universitário',
          'PUC Goiás - Área I Praça Universitária',
          'UFG - Escola de Engenharia Setor Universitário',
          'CE Jardim Novo Mundo',
          'EM Jardim Guanabara - Região Norte',
          'CE Vila Mutirão - Região Noroeste',
          'CE Finsocial - Balneário Meia Ponte',
          'EM Marechal Ribas Júnior - Vila Nova',
          'CE Dom Fernando Gomes dos Santos - Itatiaia',
          'EM Recanto das Minas Gerais',
          'CE Jardim Curitiba - Noroeste',
          'EM Parque Atheneu',
          'CE Vila Pedroso',
          'CE Senador Onofre Quinan',
        ],
        streetList: [
          'Av. Universitária, 1650',
          'Praça Universitária, 1440',
          '5ª Avenida, s/n - Setor Leste Universitário',
          'Av. Nova York, 820 - Novo Mundo',
          'Av. Nazaré, 1120 - Jardim Guanabara',
          'Av. do Povo, 1890 - Vila Mutirão',
          'Av. Mangalô, 940 - Morada do Sol',
          '9ª Avenida, 410 - Vila Nova',
          'Av. Esperança, 620',
          'Av. Gercina Borges Teixeira, 510',
          'Av. do Comércio, 1420',
          'Av. Parque Atheneu, 310',
          'Av. Anápolis, 1980',
          'Av. Perimetral Norte, 4100',
        ],
      },
    ],
  },
];

function generateCitySetores(city: CitySpec): SetorVotacao[] {
  const latScale = Math.cos((city.center[0] * Math.PI) / 180);

  // 1. Expand all clusters into individual school seed nodes with organic golden-angle spiral coordinates
  interface RawNode {
    id: string;
    codigo_local_tse: string;
    zona_eleitoral: number;
    nome_local: string;
    endereco: string;
    bairro: string;
    faixa_renda_ibge: IncomeBracketKey;
    renda_media_mensal_sm: number;
    profile: DistrictCluster['profile'];
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
      // Golden angle distribution around cluster center so points never collide and have realistic spacing
      const goldenAngle = i * 2.3999632 + cIdx * 1.1;
      const rFactor = i === 0 ? 0.08 : Math.sqrt(i / cluster.schoolsCount);
      const r = cluster.spreadDeg * rFactor;
      const lat = Number((cluster.center[0] + Math.sin(goldenAngle) * r).toFixed(5));
      const lng = Number(
        (cluster.center[1] + (Math.cos(goldenAngle) * r) / latScale).toFixed(5)
      );

      const schoolName =
        cluster.schoolPrefixList[i % cluster.schoolPrefixList.length] ||
        `EE ${cluster.bairro} Unidade ${i + 1}`;
      const street =
        cluster.streetList[i % cluster.streetList.length] ||
        `Av. Principal de ${cluster.bairro}, ${100 + i * 85}`;

      const seedNum = (cIdx + 1) * 100 + i * 17 + city.uf.charCodeAt(0);
      const secoesCount = 6 + (seedNum % 4); // 6 to 9 sections per school

      // Preserve canonical IDs for Guided Tour steps
      let canonicalId = `${city.uf.toLowerCase()}-${cluster.zona}-${1000 + schoolCounter}`;
      if (city.uf === 'SP' && cluster.bairro === 'Pinheiros' && i === 0) {
        canonicalId = 'sp-pinheiros-fernao';
      } else if (city.uf === 'SP' && cluster.bairro.startsWith('Mooca') && i === 0) {
        canonicalId = 'sp-mooca-camargo';
      } else if (city.uf === 'SP' && cluster.bairro.startsWith('Capão') && i === 0) {
        canonicalId = 'sp-capao-ceu';
      } else if (city.uf === 'PE' && cluster.bairro.startsWith('Ibura') && i === 0) {
        canonicalId = 'pe-ibura-jordao';
      } else if (city.uf === 'MG' && cluster.bairro.startsWith('Savassi') && i === 0) {
        canonicalId = 'bh-savassi-milton';
      } else if (city.uf === 'SP' && cluster.bairro.startsWith('Jardins') && i === 0) {
        canonicalId = 'sp-jardins-dante';
      }

      nodes.push({
        id: canonicalId,
        codigo_local_tse: `${city.uf}-${String(cluster.zona).padStart(4, '0')}-${
          1000 + schoolCounter
        }`,
        zona_eleitoral: cluster.zona,
        nome_local: schoolName,
        endereco: `${street} - ${cluster.bairro.split('/')[0].trim()}`,
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

  // 2. Compute true Half-Plane Clipped Voronoi Polygons for every school in the city!
  // Neighboring schools share exact straight Voronoi edges; outer edges are bounded by the school's max territory radius.
  const polygons: Pt[][] = nodes.map((node, idx) => {
    let poly = createInitialIrregularDomain(
      node.center,
      node.maxCellRadiusDeg,
      node.seedNum,
      latScale
    );

    // Sort other nodes by distance and clip against closest 20 neighbors
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
      .slice(0, 20);

    for (const { other } of others) {
      poly = clipPolygonByBisector(poly, node.center, other.center, latScale);
    }

    return poly;
  });

  // 3. Generate ballot boxes (secoes_internas) and heuristic pools for each node
  const rawSetores: SetorVotacao[] = nodes.map((node, idx) => {
    const secoes: SecaoEleitoral[] = [];

    for (let sIdx = 0; sIdx < node.secoesCount; sIdx++) {
      const secao_numero = node.secaoStart + sIdx;
      const v = ((node.seedNum + sIdx * 7) % 11) - 5; // -5 .. +5 variation per room

      let lula_1t = 140;
      let flavio_1t = 115;
      let terceira_via_1t = 40;
      let brancos_nulos_1t = 20;
      let abstencao_1t = 70;

      let delta_lula = 45;
      let delta_flavio = -18; // negative = Flavio lost votes
      let abstDrop = 12;
      let bnDrop = 5;

      if (node.profile === 'third_way_strong') {
        lula_1t = 142 + v * 2;
        flavio_1t = 94 - v;
        terceira_via_1t = 74 + v * 2;
        brancos_nulos_1t = 16 + (sIdx % 3);
        abstencao_1t = 58 + v;
        delta_lula = 54 + (sIdx % 5) * 2;
        delta_flavio = -(12 + (sIdx % 4) * 2);
        abstDrop = 6 + (sIdx % 3);
        bnDrop = 4 + (sIdx % 2);
      } else if (node.profile === 'flavio_sangria') {
        lula_1t = 114 + v * 2;
        flavio_1t = 158 - v * 2;
        terceira_via_1t = 32 + v;
        brancos_nulos_1t = 20 + (sIdx % 3);
        abstencao_1t = 66 + v;
        delta_lula = 49 + (sIdx % 5) * 2;
        delta_flavio = -(37 + (sIdx % 5) * 2);
        abstDrop = 5 + (sIdx % 3);
        bnDrop = 4 + (sIdx % 2);
      } else if (node.profile === 'abstention_mobilization') {
        lula_1t = 172 + v * 3;
        flavio_1t = 82 - v;
        terceira_via_1t = 18 + (sIdx % 4);
        brancos_nulos_1t = 26 + (sIdx % 3);
        abstencao_1t = 104 + v * 2;
        delta_lula = 58 + (sIdx % 6) * 2;
        delta_flavio = -(7 + (sIdx % 3));
        abstDrop = 43 + (sIdx % 5) * 2;
        bnDrop = 8 + (sIdx % 3);
      } else if (node.profile === 'blank_null_conversion') {
        lula_1t = 148 + v * 2;
        flavio_1t = 96 - v;
        terceira_via_1t = 19 + (sIdx % 3);
        brancos_nulos_1t = 52 + (sIdx % 5);
        abstencao_1t = 78 + v;
        delta_lula = 44 + (sIdx % 4) * 2;
        delta_flavio = -(7 + (sIdx % 3));
        abstDrop = 9 + (sIdx % 3);
        bnDrop = 30 + (sIdx % 4) * 2;
      } else if (node.profile === 'flavio_grew_2t') {
        // Rare case where Flavio Bolsonaro gained votes in the 2nd round compared to the 1st round!
        lula_1t = 92 + v * 2;
        flavio_1t = 164 - v * 2;
        terceira_via_1t = 68 + v;
        brancos_nulos_1t = 15 + (sIdx % 3);
        abstencao_1t = 56 + v;
        delta_lula = 22 + (sIdx % 4) * 2;
        delta_flavio = +(24 + (sIdx % 5) * 3); // Flavio GREW by +24..+36 votes per ballot box!
        abstDrop = 8 + (sIdx % 3);
        bnDrop = 4 + (sIdx % 2);
      }

      const eleitores_aptos =
        lula_1t + flavio_1t + terceira_via_1t + brancos_nulos_1t + abstencao_1t;
      const lula_2t = lula_1t + delta_lula;
      const flavio_2t = Math.max(20, flavio_1t + delta_flavio);
      const abstencao_2t = Math.max(15, abstencao_1t - abstDrop);
      const brancos_nulos_2t = Math.max(4, brancos_nulos_1t - bnDrop);

      const flavio_gain_2t = Math.max(0, flavio_2t - flavio_1t);
      const pool_flavio_loss = Math.max(0, flavio_1t - flavio_2t);
      const pool_abstention_drop = Math.max(0, abstencao_1t - abstencao_2t);
      const pool_blank_null_drop = Math.max(0, brancos_nulos_1t - brancos_nulos_2t);
      const pool_third_way = Math.max(0, terceira_via_1t);

      const pool_sum =
        pool_flavio_loss + pool_abstention_drop + pool_blank_null_drop + pool_third_way;

      const attr_flavio_loss = Math.round((delta_lula * pool_flavio_loss) / pool_sum);
      const attr_abstention_drop = Math.round(
        (delta_lula * pool_abstention_drop) / pool_sum
      );
      const attr_blank_null_drop = Math.round(
        (delta_lula * pool_blank_null_drop) / pool_sum
      );
      const attr_third_way = Math.max(
        0,
        delta_lula - (attr_flavio_loss + attr_abstention_drop + attr_blank_null_drop)
      );

      let dominant_factor: DominantFactorKey = 'third_way';
      if (delta_flavio > 0) {
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

      secoes.push({
        secao_numero,
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
        delta_flavio: flavio_2t - flavio_1t,
        flavio_gain_2t,
        pool_flavio_loss,
        pool_abstention_drop,
        pool_blank_null_drop,
        pool_third_way,
        attr_flavio_loss,
        attr_abstention_drop,
        attr_blank_null_drop,
        attr_third_way,
        dominant_factor,
      });
    }

    const sum = (fn: (s: SecaoEleitoral) => number) =>
      secoes.reduce((acc, s) => acc + fn(s), 0);

    const eleitores_aptos = sum((s) => s.eleitores_aptos);
    const lula_1t = sum((s) => s.lula_1t);
    const flavio_1t = sum((s) => s.flavio_1t);
    const terceira_via_1t = sum((s) => s.terceira_via_1t);
    const brancos_nulos_1t = sum((s) => s.brancos_nulos_1t);
    const abstencao_1t = sum((s) => s.abstencao_1t);

    const lula_2t = sum((s) => s.lula_2t);
    const flavio_2t = sum((s) => s.flavio_2t);
    const brancos_nulos_2t = sum((s) => s.brancos_nulos_2t);
    const abstencao_2t = sum((s) => s.abstencao_2t);

    const delta_lula = lula_2t - lula_1t;
    const delta_flavio = flavio_2t - flavio_1t;
    const flavio_grew_2t = delta_flavio > 0;
    const flavio_gain_2t = Math.max(0, delta_flavio);
    const delta_abstencao = abstencao_2t - abstencao_1t;

    const pool_flavio_loss = sum((s) => s.pool_flavio_loss);
    const pool_abstention_drop = sum((s) => s.pool_abstention_drop);
    const pool_blank_null_drop = sum((s) => s.pool_blank_null_drop);
    const pool_third_way = sum((s) => s.pool_third_way);
    const pool_total =
      pool_flavio_loss + pool_abstention_drop + pool_blank_null_drop + pool_third_way;

    const attr_flavio_loss = sum((s) => s.attr_flavio_loss);
    const attr_abstention_drop = sum((s) => s.attr_abstention_drop);
    const attr_blank_null_drop = sum((s) => s.attr_blank_null_drop);
    const attr_third_way = sum((s) => s.attr_third_way);

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
        vizinhos_count: 0,
        media_delta_lula: 0,
        media_attr_flavio_loss_pct: 0,
        media_attr_abstention_pct: 0,
        media_attr_third_way_pct: 0,
        media_attr_blank_null_pct: 0,
        destaque_ratio: 1,
        fator_destaque: dominant_factor,
        resumo_comparativo: '',
      },
      secoes_internas: secoes,
    };
  });

  // 4. Compute Neighborhood Comparisons against 5 nearest neighboring schools in the same city
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
          resumo_comparativo: `Caso atípico na cidade: enquanto escolas vizinhas registraram sangria de Flávio, neste local Flávio Bolsonaro ampliou sua votação em +${setor.flavio_gain_2t} votos no 2º turno (absorvendo parte da 3ª via conservadora), enquanto Lula somou +${setor.delta_lula} votos.`,
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

const allSetores = CITY_SPECS.flatMap(generateCitySetores);
const setoresFlavioCresceuCount = allSetores.filter((s) => s.flavio_grew_2t).length;

const CIDADES: CityQuickJump[] = CITY_SPECS.map((c) => ({
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
    center: [-23.5545, -46.5945],
    zoom: 14,
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
    center: [-23.5642, -46.6915],
    zoom: 14,
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
    center: [-23.6615, -46.7745],
    zoom: 14,
    destaqueMetrica: 'Forte queda de abstenção',
  },
  {
    step: 4,
    titulo: '4. Os Casos Atípicos Onde Flávio Bolsonaro Cresceu (+Δ22)',
    subtitulo: 'Jardins/Itaim (SP), Barra da Tijuca (RJ) e Lago Sul (DF)',
    narrativa:
      'Em cerca de 11% dos setores — concentrados em enclaves de alta renda — Flávio Bolsonaro ganhou votos no 2º turno em relação ao 1º turno (marcados em Azul Ciano), absorvendo parte da 3ª via conservadora.',
    cidade: 'São Paulo',
    setorId: 'sp-jardins-dante',
    layer: 'flavio_loss',
    center: [-23.5785, -46.6735],
    zoom: 14,
    destaqueMetrica: '+Δ22 Crescimento de Flávio',
  },
  {
    step: 5,
    titulo: '5. O Termômetro de Minas Gerais e a Virada Consolidada',
    subtitulo: 'Savassi e Padre Eustáquio (Belo Horizonte)',
    narrativa:
      'Em Belo Horizonte, a malha contígua de setores revela lado a lado a herança da 3ª via (Savassi), a sangria de Flávio (Padre Eustáquio) e os enclaves onde Flávio avançou (Lourdes/Belvedere).',
    cidade: 'Belo Horizonte',
    setorId: 'bh-savassi-milton',
    layer: 'dominant',
    center: [-19.9345, -43.9345],
    zoom: 13,
    destaqueMetrica: 'Malha Voronoi Contígua',
  },
];

const dataset: ConsolidatedDataset = {
  gerado_em: '2026-10-26T05:15:00Z',
  status_apuracao:
    'Malha Voronoi Contígua Consolidada — 522 Setores e 3.910 Seções Processadas Offline',
  total_urnas_apuradas_pct: 100.0,
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
 * Base de dados eleitoral 100% pré-processada com malha Voronoi contígua para navegação instantânea.
 */
import { ConsolidatedDataset } from '../types/electoral';

export const PRECOMPUTED_ELECTORAL_DATASET: ConsolidatedDataset = ${JSON.stringify(
  dataset
)};
`;

fs.writeFileSync(outPath, fileContent, 'utf-8');
console.log(
  `Generated offline contiguous Voronoi dataset: ${allSetores.length} setores (${setoresFlavioCresceuCount} where Flavio grew in 2T) and ${allSetores.reduce(
    (acc, s) => acc + s.secoes_internas.length,
    0
  )} secoes eleitorais.`
);
