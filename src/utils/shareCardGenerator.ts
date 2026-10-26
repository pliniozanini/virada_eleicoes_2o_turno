import { SetorVotacao } from '../types/electoral';
import { FACTOR_META, INCOME_BRACKET_LABELS } from './heuristicEngine';

export function formatWhatsAppSummary(setor: SetorVotacao): string {
  const dom = FACTOR_META[setor.dominant_factor];
  const lulaDeltaStr = `+${setor.delta_lula.toLocaleString('pt-BR')}`;
  const flavioDeltaStr =
    setor.delta_flavio >= 0
      ? `+${setor.delta_flavio.toLocaleString('pt-BR')}`
      : setor.delta_flavio.toLocaleString('pt-BR');

  return [
    `*ANATOMIA DA VIRADA 2026 — RAIO-X DO LOCAL DE VOTAÇÃO*`,
    `📍 *${setor.nome_local}*`,
    `🏘️ ${setor.bairro} · ${setor.cidade}/${setor.uf} (Zona ${setor.zona_eleitoral} · ${setor.secoes_internas.length} seções)`,
    ``,
    `📊 *Placar 1º Turno → 2º Turno:*`,
    `• Lula (13): ${setor.lula_1t.toLocaleString('pt-BR')} → *${setor.lula_2t.toLocaleString('pt-BR')}* (${lulaDeltaStr} votos)`,
    `• Flávio Bolsonaro (22): ${setor.flavio_1t.toLocaleString('pt-BR')} → *${setor.flavio_2t.toLocaleString('pt-BR')}* (${flavioDeltaStr} votos)`,
    ``,
    `🔍 *De onde vieram os +${setor.delta_lula.toLocaleString('pt-BR')} novos votos de Lula nesta escola?*`,
    `1️⃣ Sangria direta do Flávio: *+${setor.attr_flavio_loss} votos* (${setor.pct_flavio_loss}%)`,
    `2️⃣ Queda de Abstenção: *+${setor.attr_abstention_drop} votos* (${setor.pct_abstention_drop}%)`,
    `3️⃣ Herança da 3ª Via: *+${setor.attr_third_way} votos* (${setor.pct_third_way}%)`,
    `4️⃣ Conversão Brancos/Nulos: *+${setor.attr_blank_null_drop} votos* (${setor.pct_blank_null_drop}%)`,
    ``,
    `💡 *Fator Dominante:* ${dom.label}`,
    `📌 *Comparativo com a Vizinhança:* ${setor.comparativo_vizinhanca.resumo_comparativo}`,
  ].join('\n');
}

export function renderSocialCardDataUrl(setor: SetorVotacao): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const domMeta = FACTOR_META[setor.dominant_factor];

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1350);
  bgGrad.addColorStop(0, '#090D16');
  bgGrad.addColorStop(0.5, '#0F172A');
  bgGrad.addColorStop(1, '#090D16');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1350);

  // Subtle top accent bar matching dominant factor
  ctx.fillStyle = domMeta.color;
  ctx.fillRect(0, 0, 1080, 14);

  // Header Kicker
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 22px "Public Sans", sans-serif';
  ctx.fillText('ANATOMIA DA VIRADA 2026 · RAIO-X POR LOCAL DE VOTAÇÃO', 72, 82);

  // School Name
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 44px "Bricolage Grotesque", sans-serif';
  const titleWords = setor.nome_local.split(' ');
  let line = '';
  let y = 148;
  for (const word of titleWords) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > 930 && line !== '') {
      ctx.fillText(line.trim(), 72, y);
      line = word + ' ';
      y += 54;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), 72, y);

  // Subtitle Metadata
  y += 46;
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 24px "Public Sans", sans-serif';
  const incomeLabel = INCOME_BRACKET_LABELS[setor.faixa_renda_ibge]?.label || '';
  const secoesLen = setor.secoes_count || setor.secoes_internas?.length || 8;
  ctx.fillText(
    `${setor.bairro} · ${setor.cidade}/${setor.uf} · Zona ${setor.zona_eleitoral} · ${secoesLen} Seções · ${incomeLabel}`,
    72,
    y
  );

  // Divider
  y += 36;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, y);
  ctx.lineTo(1008, y);
  ctx.stroke();

  // Scorecard Boxes (Lula 13 vs Flávio 22)
  y += 36;
  const boxW = 450;
  const boxH = 190;

  // Lula Box
  ctx.fillStyle = 'rgba(244, 63, 94, 0.1)';
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(72, y, boxW, boxH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FDA4AF';
  ctx.font = '600 22px "Public Sans", sans-serif';
  ctx.fillText('LULA DA SILVA (13)', 102, y + 46);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 48px "JetBrains Mono", monospace';
  ctx.fillText(`${setor.lula_2t.toLocaleString('pt-BR')} votos (2T)`, 102, y + 112);

  ctx.fillStyle = '#34D399';
  ctx.font = '600 24px "JetBrains Mono", monospace';
  ctx.fillText(
    `1T: ${setor.lula_1t.toLocaleString('pt-BR')}  |  Δ +${setor.delta_lula.toLocaleString('pt-BR')} votos`,
    102,
    y + 158
  );

  // Flávio Box
  const rightX = 558;
  ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.beginPath();
  ctx.roundRect(rightX, y, boxW, boxH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#93C5FD';
  ctx.font = '600 22px "Public Sans", sans-serif';
  ctx.fillText('FLÁVIO BOLSONARO (22)', rightX + 30, y + 46);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 48px "JetBrains Mono", monospace';
  ctx.fillText(`${setor.flavio_2t.toLocaleString('pt-BR')} votos (2T)`, rightX + 30, y + 112);

  ctx.fillStyle = '#FB7185';
  ctx.font = '600 24px "JetBrains Mono", monospace';
  const flavioDeltaFormatted =
    setor.delta_flavio >= 0 ? `+${setor.delta_flavio}` : `${setor.delta_flavio}`;
  ctx.fillText(
    `1T: ${setor.flavio_1t.toLocaleString('pt-BR')}  |  Δ ${flavioDeltaFormatted} votos`,
    rightX + 30,
    y + 158
  );

  // Section Title: Origin of New Votes
  y += boxH + 62;
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 30px "Bricolage Grotesque", sans-serif';
  ctx.fillText(
    `ORIGEM DOS +${setor.delta_lula.toLocaleString('pt-BR')} NOVOS VOTOS DE LULA NESTE LOCAL`,
    72,
    y
  );

  const pools = [
    {
      label: 'Virada Direta (Sangria do Flávio)',
      votes: setor.attr_flavio_loss,
      pct: setor.pct_flavio_loss,
      color: '#F43F5E',
    },
    {
      label: 'Queda de Abstenção (Mobilização)',
      votes: setor.attr_abstention_drop,
      pct: setor.pct_abstention_drop,
      color: '#F59E0B',
    },
    {
      label: 'Herança de Eleitores da 3ª Via',
      votes: setor.attr_third_way,
      pct: setor.pct_third_way,
      color: '#A855F7',
    },
    {
      label: 'Conversão de Brancos e Nulos',
      votes: setor.attr_blank_null_drop,
      pct: setor.pct_blank_null_drop,
      color: '#10B981',
    },
  ];

  y += 32;
  for (const pool of pools) {
    y += 42;
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 24px "Public Sans", sans-serif';
    ctx.fillText(pool.label, 72, y);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    const statText = `+${pool.votes} votos (${pool.pct}%)`;
    const statW = ctx.measureText(statText).width;
    ctx.fillText(statText, 1008 - statW, y);

    // Bar track
    y += 16;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(72, y, 936, 22, 11);
    ctx.fill();

    // Bar fill
    const fillW = Math.max(18, (936 * pool.pct) / 100);
    ctx.fillStyle = pool.color;
    ctx.beginPath();
    ctx.roundRect(72, y, fillW, 22, 11);
    ctx.fill();

    y += 38;
  }

  // Neighborhood Insight Box
  y += 28;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.strokeStyle = domMeta.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(72, y, 936, 155, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = domMeta.color;
  ctx.font = '700 22px "Public Sans", sans-serif';
  ctx.fillText(
    `FATOR DOMINANTE: ${domMeta.label.toUpperCase()}`,
    102,
    y + 44
  );

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '400 23px "Public Sans", sans-serif';
  const insightWords = setor.comparativo_vizinhanca.resumo_comparativo.split(' ');
  let iLine = '';
  let iy = y + 86;
  for (const w of insightWords) {
    const test = iLine + w + ' ';
    if (ctx.measureText(test).width > 876 && iLine !== '') {
      ctx.fillText(iLine.trim(), 102, iy);
      iLine = w + ' ';
      iy += 34;
    } else {
      iLine = test;
    }
  }
  ctx.fillText(iLine.trim(), 102, iy);

  // Footer
  ctx.fillStyle = '#64748B';
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.fillText(
    `Código TSE: ${setor.codigo_local_tse} · Heurística de Balanço Proporcional por Seção Eleitoral`,
    72,
    1302
  );

  return canvas.toDataURL('image/png');
}
