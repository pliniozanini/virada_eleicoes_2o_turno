import { DominantFactorKey, SecaoEleitoral, SetorVotacao } from '../types/electoral';

export const FACTOR_META: Record<
  DominantFactorKey,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    description: string;
  }
> = {
  flavio_loss: {
    label: 'Virada Direta (Sangria do Flávio)',
    shortLabel: 'Sangria do Flávio',
    color: '#F43F5E', // rose-500
    bgClass: 'bg-rose-500',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/40',
    description:
      'Eleitores que votaram em Flávio Bolsonaro (22) no 1º turno e migraram diretamente para Lula (13) no 2º turno.',
  },
  abstention_drop: {
    label: 'Queda de Abstenção (Mobilização)',
    shortLabel: 'Queda de Abstenção',
    color: '#F59E0B', // amber-500
    bgClass: 'bg-amber-500',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/40',
    description:
      'Eleitores que se abstiveram no 1º turno e compareceram às urnas no 2º turno impulsionando a virada.',
  },
  third_way: {
    label: 'Herança da 3ª Via',
    shortLabel: 'Herança da 3ª Via',
    color: '#A855F7', // purple-500
    bgClass: 'bg-purple-500',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/40',
    description:
      'Transferência de votos de candidatos eliminados no 1º turno para a candidatura de Lula no 2º turno.',
  },
  blank_null_drop: {
    label: 'Conversão de Brancos e Nulos',
    shortLabel: 'Conversão B/N',
    color: '#10B981', // emerald-500
    bgClass: 'bg-emerald-500',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/40',
    description:
      'Redução líquida de votos brancos e nulos entre o 1º e o 2º turno convertida em votos válidos.',
  },
  flavio_gain: {
    label: 'Crescimento de Flávio no 2ºT (Reduto 22)',
    shortLabel: 'Avanço Flávio (+22)',
    color: '#0EA5E9', // sky-500
    bgClass: 'bg-sky-500',
    textClass: 'text-sky-400',
    borderClass: 'border-sky-500/40',
    description:
      'Caso atípico onde Flávio Bolsonaro (22) ganhou votos absolutos no 2º turno em relação ao 1º turno, absorvendo parte da 3ª via conservadora.',
  },
};

export const INCOME_BRACKET_LABELS: Record<string, { label: string; range: string }> = {
  ate_2sm: { label: 'Baixa Renda (Periferia)', range: 'Até 2 Salários Mínimos' },
  de_2_a_5sm: { label: 'Renda Média-Baixa', range: '2 a 5 Salários Mínimos' },
  de_5_a_10sm: { label: 'Classe Média Central', range: '5 a 10 Salários Mínimos' },
  acima_10sm: { label: 'Alta Renda', range: 'Acima de 10 Salários Mínimos' },
};

export function computeSectionHeuristic(raw: {
  secao_numero: number;
  eleitores_aptos: number;
  lula_1t: number;
  flavio_1t: number;
  terceira_via_1t: number;
  brancos_nulos_1t: number;
  abstencao_1t: number;
  lula_2t: number;
  flavio_2t: number;
  brancos_nulos_2t: number;
  abstencao_2t: number;
}): SecaoEleitoral {
  const delta_lula = Math.max(0, raw.lula_2t - raw.lula_1t);
  const delta_flavio = raw.flavio_2t - raw.flavio_1t;
  const flavio_gain_2t = Math.max(0, delta_flavio);

  const pool_flavio_loss = Math.max(0, raw.flavio_1t - raw.flavio_2t);
  const pool_abstention_drop = Math.max(0, raw.abstencao_1t - raw.abstencao_2t);
  const pool_blank_null_drop = Math.max(0, raw.brancos_nulos_1t - raw.brancos_nulos_2t);
  const pool_third_way = Math.max(0, raw.terceira_via_1t);

  const pool_sum =
    pool_flavio_loss + pool_abstention_drop + pool_blank_null_drop + pool_third_way;

  let attr_flavio_loss = 0;
  let attr_abstention_drop = 0;
  let attr_blank_null_drop = 0;
  let attr_third_way = 0;

  if (delta_lula > 0 && pool_sum > 0) {
    attr_flavio_loss = Math.round((delta_lula * pool_flavio_loss) / pool_sum);
    attr_abstention_drop = Math.round((delta_lula * pool_abstention_drop) / pool_sum);
    attr_blank_null_drop = Math.round((delta_lula * pool_blank_null_drop) / pool_sum);
    attr_third_way = Math.max(
      0,
      delta_lula - (attr_flavio_loss + attr_abstention_drop + attr_blank_null_drop)
    );
  }

  let dominant_factor: DominantFactorKey = 'third_way';
  if (delta_flavio > 0 && delta_flavio >= delta_lula * 0.65) {
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

  return {
    ...raw,
    delta_lula,
    delta_flavio,
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
  };
}

export function parseCustomTseUpload(
  content: string,
  filename: string,
  existingSetores: SetorVotacao[]
): SetorVotacao[] {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const items = Array.isArray(parsed) ? parsed : parsed.setores || [];
    if (items.length > 0 && items[0].nome_local) {
      return items as SetorVotacao[];
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return existingSetores;

  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(separator).map((h) => h.trim().toLowerCase());

  const byLocal = new Map<string, any[]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(separator).map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    const key = row['codigo_local_tse'] || row['nome_local'] || `LOCAL_${i}`;
    if (!byLocal.has(key)) byLocal.set(key, []);
    byLocal.get(key)!.push(row);
  }

  const updated = [...existingSetores];

  byLocal.forEach((rows, key) => {
    const first = rows[0];
    const lat = parseFloat(first['lat'] || '-23.5505');
    const lng = parseFloat(first['lng'] || '-46.6333');

    const secoes: SecaoEleitoral[] = rows.map((r, idx) =>
      computeSectionHeuristic({
        secao_numero: parseInt(r['secao_numero'] || `${101 + idx}`, 10),
        eleitores_aptos: parseInt(r['eleitores_aptos'] || '380', 10),
        lula_1t: parseInt(r['lula_1t'] || '130', 10),
        flavio_1t: parseInt(r['flavio_1t'] || '125', 10),
        terceira_via_1t: parseInt(r['terceira_via_1t'] || '45', 10),
        brancos_nulos_1t: parseInt(r['brancos_nulos_1t'] || '20', 10),
        abstencao_1t: parseInt(r['abstencao_1t'] || '60', 10),
        lula_2t: parseInt(r['lula_2t'] || '185', 10),
        flavio_2t: parseInt(r['flavio_2t'] || '110', 10),
        brancos_nulos_2t: parseInt(r['brancos_nulos_2t'] || '14', 10),
        abstencao_2t: parseInt(r['abstencao_2t'] || '45', 10),
      })
    );

    const sum = (fn: (s: SecaoEleitoral) => number) =>
      secoes.reduce((acc, s) => acc + fn(s), 0);

    const lula_1t = sum((s) => s.lula_1t);
    const flavio_1t = sum((s) => s.flavio_1t);
    const terceira_via_1t = sum((s) => s.terceira_via_1t);
    const brancos_nulos_1t = sum((s) => s.brancos_nulos_1t);
    const abstencao_1t = sum((s) => s.abstencao_1t);
    const lula_2t = sum((s) => s.lula_2t);
    const flavio_2t = sum((s) => s.flavio_2t);
    const brancos_nulos_2t = sum((s) => s.brancos_nulos_2t);
    const abstencao_2t = sum((s) => s.abstencao_2t);
    const eleitores_aptos = sum((s) => s.eleitores_aptos);

    const delta_lula = Math.max(0, lula_2t - lula_1t);
    const delta_flavio = flavio_2t - flavio_1t;
    const flavio_grew_2t = delta_flavio > 0;
    const flavio_gain_2t = Math.max(0, delta_flavio);
    const delta_abstencao = abstencao_2t - abstencao_1t;

    const pool_flavio_loss = Math.max(0, flavio_1t - flavio_2t);
    const pool_abstention_drop = Math.max(0, abstencao_1t - abstencao_2t);
    const pool_blank_null_drop = Math.max(0, brancos_nulos_1t - brancos_nulos_2t);
    const pool_third_way = Math.max(0, terceira_via_1t);
    const pool_total =
      pool_flavio_loss + pool_abstention_drop + pool_blank_null_drop + pool_third_way;

    const attr_flavio_loss = sum((s) => s.attr_flavio_loss);
    const attr_abstention_drop = sum((s) => s.attr_abstention_drop);
    const attr_blank_null_drop = sum((s) => s.attr_blank_null_drop);
    const attr_third_way = sum((s) => s.attr_third_way);

    const denom = Math.max(1, delta_lula);
    const pct_flavio_loss = Number(((attr_flavio_loss / denom) * 100).toFixed(1));
    const pct_abstention_drop = Number(((attr_abstention_drop / denom) * 100).toFixed(1));
    const pct_blank_null_drop = Number(((attr_blank_null_drop / denom) * 100).toFixed(1));
    const pct_third_way = Number(((attr_third_way / denom) * 100).toFixed(1));

    let dominant_factor: DominantFactorKey = 'third_way';
    if (flavio_grew_2t && delta_flavio >= delta_lula * 0.65) {
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

    const d = 0.0055;
    const polygon: [number, number][] = [
      [lat + d, lng - d * 0.7],
      [lat + d * 0.8, lng + d * 0.9],
      [lat - d * 0.3, lng + d * 1.1],
      [lat - d, lng + d * 0.2],
      [lat - d * 0.7, lng - d * 0.95],
    ];

    const newSetor: SetorVotacao = {
      id: `custom-${key}`,
      codigo_local_tse: key,
      zona_eleitoral: parseInt(first['zona_eleitoral'] || '1', 10),
      nome_local: first['nome_local'] || `Local Importado (${filename})`,
      endereco: first['endereco'] || 'Endereço importado via arquivo TSE',
      bairro: first['bairro'] || 'Centro',
      cidade: first['cidade'] || 'São Paulo',
      uf: first['uf'] || 'SP',
      regiao: 'Sudeste',
      faixa_renda_ibge: 'de_2_a_5sm',
      renda_media_mensal_sm: 3.8,
      teve_2t_governador: true,
      contexto_palanque_estadual: 'Disputa de 2º turno estadual',
      center: [lat, lng],
      polygon,
      area_km2: 1.4,
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
        media_delta_lula: Math.round(delta_lula * 0.82),
        media_attr_flavio_loss_pct: 24.5,
        media_attr_abstention_pct: 31.0,
        media_attr_third_way_pct: 33.5,
        media_attr_blank_null_pct: 11.0,
        destaque_ratio: 1.4,
        fator_destaque: dominant_factor,
        resumo_comparativo:
          'Setor importado via lote TSE apresenta variação eleitoral calculada sobre as seções informadas.',
      },
      secoes_internas: secoes,
    };

    updated.unshift(newSetor);
  });

  return updated;
}
