# Anatomia da Virada 2026 — Explorador Geoespacial e Narrativa de Dados Eleitorais

Uma aplicação web interativa de jornalismo de dados e exploração geoespacial em alta resolução (inspirada nos mapas de *precincts* do *The New York Times*) que investiga e decompõe a origem dos votos que garantiram a virada de Luiz Inácio Lula da Silva (13) sobre Flávio Bolsonaro (22) no 2º Turno da Eleição Presidencial de 2026, operando no nível granular de **Setores de Votação (Escolas/Locais)** e **Seções Eleitorais (Salas/Urnas)** com dados 100% pré-processados para leitura instantânea.

## User Review & Critical Decisions

> [!IMPORTANT]
> As decisões abaixo refletem o alinhamento definido para a arquitetura de dados e experiência de uso:

- **Decisão Confirmada 1 — Dataset Consolidado 100% Pré-Processado (Leitura Instantânea)**: Em vez de um recorte parcial que exige cálculos pesados em tempo de execução, toda a base de dados nacional consolidada (cobrindo capitais e polos das 5 regiões do Brasil: São Paulo, Rio de Janeiro, Belo Horizonte, Recife, Salvador, Porto Alegre, Curitiba, Brasília, Fortaleza, Manaus, Belém e Goiânia) já estará pré-processada estaticamente com polígonos contíguos de microterritórios, heurística dos 4 *pools* calculada, médias de vizinhança prontas e detalhamento interno de seções eleitorais. A navegação no mapa apenas lê os dados já consolidados com latência zero. O modal de importação de arquivos TSE (`.csv`/`.json`) permanece disponível para auditoria ou substituição de dados customizados.
- **Decisão Confirmada 2 — Mapa Direto com Tour Guiado Opcional no Topo**: O aplicativo abre diretamente sobre o mapa interativo escuro em tela cheia, acompanhado de um controle superior para iniciar o **"Tour Guiado da Virada"** (narrativa passo a passo que voa pelos capítulos-chave da eleição) sem bloquear o usuário que deseja explorar sua rua ou escola imediatamente.
- **Decisão Confirmada 3 — Compartilhamento Duplo (WhatsApp + Card Visual PNG)**: O painel de Raio-X de cada local de votação contará tanto com cópia instantânea de resumo jornalístico formatado para WhatsApp quanto com geração e download imediato de um Card Visual em alta definição (PNG via Canvas) pronto para redes sociais.

---

## 1. Overview & Core Concept

- **O Que Faz**: Permite a jornalistas, analistas políticos e eleitores explorar o mapa eleitoral brasileiro no nível de microterritórios escolares (**Setores de Votação**) e urnas individuais (**Seções Eleitorais**), respondendo de onde vieram os novos votos de Lula no 2º turno através de quatro fontes: **Virada Direta (Sangria do Flávio)**, **Queda de Abstenção (Mobilização)**, **Herança da 3ª Via** e **Conversão de Brancos e Nulos**.
- **Público-Alvo**: Leitores de jornalismo de dados, pesquisadores, estrategistas políticos e cidadãos curiosos para consultar o comportamento eleitoral exato da escola onde votam (*"E na sua rua?"*).
- **Valor Principal**: Transforma dados brutos de boletins de urna em uma leitura cartográfica clara e auditável, combinando visão macro (cascata nacional, renda IBGE e efeito palanque estadual) com visão micro (comparativo com a vizinhança imediata e tabela urna a urna dentro de cada prédio escolar).

---

## 2. User Experience & Visual Design

### Fluxos Principais do Usuário
1. **Abertura Direta & Visão Geral**: O usuário aterrissa no mapa escuro (`CartoDB Dark Matter`) exibindo a Camada 1 (*Fator Dominante da Virada*). No topo, uma barra enxuta oferece o botão **"Iniciar Tour Guiado"** (que conduz a câmera por 5 paradas comentadas da virada pelo país), atalhos rápidos de regiões/capitais e o botão de inspeção/importação da base TSE.
2. **Busca Semântica ("E na sua rua?") & Salto Rápido**: No painel flutuante superior esquerdo, o usuário pesquisa por nome da escola, rua/endereço, bairro, zona eleitoral ou número de seção (ex: `"Seção 104"`), ou clica nos seletores rápidos de cidades. O mapa executa um voo suave (`flyTo`) até o polígono correspondente, destaca suas bordas em alto contraste e abre o painel lateral de Raio-X.
3. **Alternância de Camadas Cartográficas**: No painel superior direito, o usuário alterna entre 4 lentes analíticas com atualização imediata da legenda dinâmica:
   - **Camada 1 — Fator Dominante**: Mapa categórico com as 4 cores semânticas da fonte principal de crescimento de Lula naquele setor.
   - **Camada 2 — Intensidade da Sangria do Flávio**: Mapa coroplético de calor destacando onde Flávio Bolsonaro mais perdeu votos absolutos entre o 1º e o 2º turno.
   - **Camada 3 — Mobilização e Queda de Abstenção**: Escala divergente mostrando onde o comparecimento subiu vs. onde a abstenção cresceu.
   - **Camada 4 — Decisividade da 3ª Via**: Mapa de intensidade destacando os redutos onde o eleitorado de candidatos eliminados no 1º turno migrou em peso.
4. **Inspeção em Raio-X (Gaveta Lateral Direita)**: Ao clicar em qualquer polígono de local de votação, abre-se o painel detalhado contendo:
   - Cabeçalho com Zona Eleitoral, Nome da Escola/Local, Bairro, Cidade/UF e Endereço completo.
   - Placar comparativo 1º Turno vs. 2º Turno e variação líquida ($\Delta$) para Lula (13) e Flávio Bolsonaro (22).
   - Barras horizontais da **Decomposição da Origem dos Votos** (votos estimados e percentual vindos de cada um dos 4 *pools*).
   - Caixa de insight **Comparativo com a Vizinhança**, contrastando a escola selecionada com a média pré-calculada dos setores vizinhos (ex: *"Este local teve 2,3x mais virada direta do Flávio que a média do entorno"*).
   - Tabela completa de **Seções Eleitorais (Urnas / Salas)** daquele edifício (Seção, $+\Delta\text{Lula}$, Perda Flávio, Queda Abstenção, Pool 3ª Via, Conversão B/N e Fator Dominante da sala), com busca e ordenação por coluna.
   - Ações de compartilhamento: **Copiar Resumo para WhatsApp** e **Baixar Card Visual (PNG)**.
5. **Análise Cruzada Socioeconômica (Painel Retrátil Inferior)**: Uma gaveta inferior expansível com 3 abas analíticas sincronizadas com o recorte nacional ou a cidade ativa no mapa:
   - **Aba 1 — Faixas de Renda (Censo IBGE)**: Mostra como a queda de abstenção liderou nas periferias de baixa renda (até 2 SM), enquanto a herança da 3ª via e a sangria direta de Flávio dominaram nos setores de renda média e alta (5 a +10 SM).
   - **Aba 2 — Efeito Palanque Estadual ("Efeito Governador")**: Compara a migração de votos e a queda de abstenção entre estados que tiveram disputa de 2º turno para governador vs. estados onde o governador foi definido já no 1º turno.
   - **Aba 3 — Cascata Geral da Virada (Gráfico Waterfall)**: Ponte visual consolidada ligando a votação de Lula no 1º turno ao total vitorioso do 2º turno, somando a contribuição exata de cada um dos 4 *pools*.

### Identidade Visual & Tema
- **Direção Estética**: Jornalismo de dados investigativo e cartografia de precisão (inspirado no *The New York Times Upshot* e *Nexo Jornal*), em modo escuro profundo para máximo contraste cromático dos polígonos eleitorais.
- **Paleta de Cores (Disciplina 60-30-10)**:
  - **Superfícies Neutras (60% + 30%)**: Fundo cartográfico em carvão profundo (`#090D16`), painéis em ardósia translúcida (`#0F172A/90` com `backdrop-blur-md`) e divisórias sutis (`1px solid rgba(255,255,255,0.08)`).
  - **Cores Semânticas dos 4 Pools (10% Orçamento de Acento e Cartografia)**:
    - **Virada Direta / Sangria do Flávio**: Carmesim/Rosa (`#F43F5E` / `rose-500`)
    - **Queda de Abstenção / Mobilização**: Âmbar/Laranja (`#F59E0B` / `amber-500`)
    - **Herança da 3ª Via**: Roxo Editorial (`#A855F7` / `purple-500`)
    - **Conversão de Brancos e Nulos**: Esmeralda (`#10B981` / `emerald-500`)
- **Tipografia & Hierarquia (Regra 2+1)**:
  - *Display / Títulos Editoriais*: `Bricolage Grotesque` ou `Plus Jakarta Sans` (peso 600–700, `text-wrap: balance`).
  - *Corpo e Leitura Jornalística*: `Public Sans` (alta legibilidade em tamanhos 13px–15px).
  - *Dados, Urnas e Tabelas*: `JetBrains Mono` com `tabular-nums` obrigatório em todos os números de votos, variações ($\Delta$) e percentuais para alinhamento vertical rigoroso.

### Feedback Interativo & Movimento
- Destaque imediato (`hover`) nos polígonos com *tooltip* flutuante mostrando o nome da escola, $+\Delta\text{Lula}$ e o fator dominante em menos de 100ms.
- Transições de câmera suaves (`flyTo`) ao clicar em resultados de busca, botões de cidades ou capítulos do Tour Guiado.
- Gerador instantâneo de Card Visual em Canvas HTML5 com pré-visualização antes do download.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Base Consolidada 100% Pré-Processada em Memória vs. Cálculo Dinâmico Pesado**
  - *Abordagem Escolhida*: Gerar e estruturar um dataset nacional completo e pré-processado (contendo as coordenadas de polígonos Voronoi/microbairros, os 4 *pools* da heurística de balanço simples já computados por seção e por escola, as estatísticas de vizinhança e os agregados do Censo IBGE/Palanque Estadual).
  - *Por Quê*: Garante que toda interação de zoom, troca de camada, filtro por cidade ou clique em escola ocorra instantaneamente apenas lendo propriedades já consolidadas, eliminando travamentos na interface.
  - *Flexibilidade Mantida*: O motor matemático da Heurística de Balanço Simples também fica exposto em uma função pura para que o modal **"Base de Dados TSE (CSV/JSON)"** permita testar ou carregar arquivos externos quando desejado.

- **Decisão 2: Renderização Cartográfica com Leaflet + Tiles Escuros CartoDB Sem Chave**
  - *Abordagem Escolhida*: Utilizar `leaflet` / `react-leaflet` com tiles vetoriais/raster `CartoDB Dark Matter` (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`).
  - *Por Quê*: Funciona imediatamente no ambiente em nuvem sem necessidade de chaves pagas de API, oferece excelente nitidez para nomes de ruas e bairros sobrepostos aos polígonos semitransparentes e suporta estilização reativa rápida de centenas de setores e urnas.

---

## 4. Technical Architecture & Data Strategy

### Diagrama de Arquitetura e Componentes

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 CAMADA DE DADOS PRÉ-PROCESSADOS (OFFLINE-READY)              │
│  ┌────────────────────────────┐  ┌───────────────────────┐  ┌──────────────┐ │
│  │ Setores de Votação GeoJSON │  │ Seções Eleitorais     │  │ Agregados    │ │
│  │ (Polígonos + 4 Pools +     │  │ (Salas 101..N por     │  │ IBGE, UF e   │ │
│  │  Média da Vizinhança)      │  │  Escola já calculadas)│  │ Waterfall 2T │ │
│  └─────────────┬──────────────┘  └───────────┬───────────┘  └──────┬───────┘ │
└────────────────┼─────────────────────────────┼─────────────────────┼─────────┘
                 │                             │                     │
                 ▼                             ▼                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ESTADO CENTRAL DA APLICAÇÃO (React)                      │
│  • activeLayer ('dominant' | 'flavio_loss' | 'abstention' | 'third_way')     │
│  • selectedLocationId / hoveredLocationId / activeCityFilter                 │
│  • tourStepIndex (Modo Tour Guiado opcional) / bottomDockTab & isExpanded    │
└───────┬──────────────────┬───────────────────┬─────────────────────┬─────────┘
        │                  │                   │                     │
        ▼                  ▼                   ▼                     ▼
┌───────────────┐  ┌───────────────┐  ┌─────────────────┐  ┌───────────────────┐
│ Barra Topo &  │  │ Painel Busca  │  │ Mapa Interativo │  │ Gaveta Raio-X     │
│ Tour Guiado   │  │ "E na sua     │  │ + Seletor de 4  │  │ • Placar 1T vs 2T │
│ • 5 Capítulos │  │  rua?" +      │  │   Camadas +     │  │ • 4 Barras Origem │
│ • Resumo Nac. │  │  Pills Cidades│  │   Legenda       │  │ • Vizinhança      │
│ • Modal TSE   │  │  (flyTo)      │  │   Dinâmica      │  │ • Tabela Seções   │
└───────────────┘  └───────────────┘  └─────────────────┘  │ • Card PNG & Zap  │
                                                           └─────────┬─────────┘
                                                                     │
                                                                     ▼
                                                           ┌───────────────────┐
                                                           │ Painel Inferior   │
                                                           │ • Renda IBGE      │
                                                           │ • Efeito Governo  │
                                                           │ • Cascata 1T->2T  │
                                                           └───────────────────┘
```

### Modelo de Dados e Heurística Pré-Calculada ("Balanço Simples")
Para cada Seção Eleitoral e cada Setor de Votação (Escola), os registros já trazem calculados os valores exatos da heurística:
1. **Crescimento de Lula no 2º Turno**:
   $$\Delta\text{Lula} = \max(0, \text{Lula}_{2T} - \text{Lula}_{1T})$$
2. **Dimensionamento dos 4 Pools de Origem na mesma unidade**:
   - $\text{Pool}_{\text{SangriaFlavio}} = \max(0, \text{Flavio}_{1T} - \text{Flavio}_{2T})$
   - $\text{Pool}_{\text{QuedaAbstencao}} = \max(0, \text{Abstencao}_{1T} - \text{Abstencao}_{2T})$
   - $\text{Pool}_{\text{QuedaBrancoNulo}} = \max(0, \text{BN}_{1T} - \text{BN}_{2T})$
   - $\text{Pool}_{\text{TerceiraVia}} = \text{Votos}_{3\text{aVia}, 1T}$
3. **Atribuição Proporcional Auditável**:
   - Cada fonte recebe $\text{VotosAtribuidos}_i = \Delta\text{Lula} \times \left(\frac{\text{Pool}_i}{\sum \text{Pool}}\right)$, definindo a tag `dominant_factor` e os percentuais exatos lidos pela interface.

### Mapeamento de Interações e Estado
- **Busca Semântica e Seletor de Cidades**: Filtra em tempo real por nome da escola, logradouro, bairro, zona ou número de seção; clicar em um item aciona `map.flyTo(coords, 15)` e define `selectedLocationId`.
- **Tour Guiado da Virada**: Barra de controle passo a passo (ex: *1. A Sangria na Classe Média Paulistana*, *2. Mobilização na Periferia do Rio e Baixada*, *3. A Herança Decisiva em BH*, *4. O Salto de Comparecimento no Nordeste*, *5. A Virada Consolidada*) que move a câmera, alterna a camada relevante e abre o Raio-X do setor emblemático.
- **Exportador de Card Social (Canvas) & WhatsApp**: Gera dinamicamente um card gráfico 1080x1350px com os dados da escola selecionada para download imediato em PNG, além de formatar o texto estruturado para cópia na área de transferência com feedback visual.
