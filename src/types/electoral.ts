export type DominantFactorKey =
  | 'flavio_loss'
  | 'abstention_drop'
  | 'third_way'
  | 'blank_null_drop'
  | 'flavio_gain';

export type MapLayerId =
  | 'dominant'
  | 'flavio_loss'
  | 'abstention'
  | 'third_way';

export type IncomeBracketKey =
  | 'ate_2sm'
  | 'de_2_a_5sm'
  | 'de_5_a_10sm'
  | 'acima_10sm';

export interface SecaoEleitoral {
  secao_numero: number;
  eleitores_aptos: number;
  // 1st Round
  lula_1t: number;
  flavio_1t: number;
  terceira_via_1t: number;
  brancos_nulos_1t: number;
  abstencao_1t: number;
  // 2nd Round
  lula_2t: number;
  flavio_2t: number;
  brancos_nulos_2t: number;
  abstencao_2t: number;
  // Pre-computed Simple Balance Heuristic at Section Level
  delta_lula: number;
  delta_flavio: number; // positive when Flavio gained votes in 2nd round!
  flavio_gain_2t: number;
  pool_flavio_loss: number;
  pool_abstention_drop: number;
  pool_blank_null_drop: number;
  pool_third_way: number;
  attr_flavio_loss: number;
  attr_abstention_drop: number;
  attr_blank_null_drop: number;
  attr_third_way: number;
  dominant_factor: DominantFactorKey;
}

export interface NeighborhoodComparison {
  vizinhos_count: number;
  media_delta_lula: number;
  media_attr_flavio_loss_pct: number;
  media_attr_abstention_pct: number;
  media_attr_third_way_pct: number;
  media_attr_blank_null_pct: number;
  destaque_ratio: number;
  fator_destaque: DominantFactorKey;
  resumo_comparativo: string;
}

export interface SetorVotacao {
  id: string;
  codigo_local_tse: string;
  zona_eleitoral: number;
  nome_local: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  regiao: 'Sudeste' | 'Nordeste' | 'Sul' | 'Centro-Oeste' | 'Norte';
  faixa_renda_ibge: IncomeBracketKey;
  renda_media_mensal_sm: number;
  teve_2t_governador: boolean;
  contexto_palanque_estadual: string;
  center: [number, number]; // [lat, lng]
  polygon: [number, number][]; // Mathematically clipped Voronoi polygon sharing borders with neighbors
  area_km2: number;
  eleitores_aptos: number;
  // Aggregated 1st Round
  lula_1t: number;
  flavio_1t: number;
  terceira_via_1t: number;
  brancos_nulos_1t: number;
  abstencao_1t: number;
  // Aggregated 2nd Round
  lula_2t: number;
  flavio_2t: number;
  brancos_nulos_2t: number;
  abstencao_2t: number;
  // Pre-computed Heuristic Pools & Attribution
  delta_lula: number;
  delta_flavio: number; // positive when Flavio gained votes in 2T
  flavio_grew_2t: boolean;
  flavio_gain_2t: number;
  delta_abstencao: number;
  pool_flavio_loss: number;
  pool_abstention_drop: number;
  pool_blank_null_drop: number;
  pool_third_way: number;
  pool_total: number;
  // Attributed new votes for Lula
  attr_flavio_loss: number;
  attr_abstention_drop: number;
  attr_blank_null_drop: number;
  attr_third_way: number;
  // Attributed percentages (0 - 100)
  pct_flavio_loss: number;
  pct_abstention_drop: number;
  pct_blank_null_drop: number;
  pct_third_way: number;
  dominant_factor: DominantFactorKey;
  // Pre-computed Neighborhood Insight
  comparativo_vizinhanca: NeighborhoodComparison;
  // Internal Ballot Boxes (Salas / Urnas)
  secoes_internas: SecaoEleitoral[];
}

export interface CityQuickJump {
  id: string;
  label: string;
  uf: string;
  regiao: string;
  center: [number, number];
  zoom: number;
  descricao_curta: string;
}

export interface GuidedTourStep {
  step: number;
  titulo: string;
  subtitulo: string;
  narrativa: string;
  cidade: string;
  setorId: string;
  layer: MapLayerId;
  center: [number, number];
  zoom: number;
  destaqueMetrica: string;
}

export interface ConsolidatedDataset {
  gerado_em: string;
  status_apuracao: string;
  total_urnas_apuradas_pct: number;
  resumo_nacional: {
    lula_1t_nacional: number;
    lula_2t_nacional: number;
    flavio_1t_nacional: number;
    flavio_2t_nacional: number;
    delta_lula_nacional: number;
    attr_flavio_loss_nacional: number;
    attr_abstention_drop_nacional: number;
    attr_third_way_nacional: number;
    attr_blank_null_drop_nacional: number;
    setores_flavio_cresceu_count: number;
  };
  cidades: CityQuickJump[];
  tour_guiado: GuidedTourStep[];
  setores: SetorVotacao[];
}
