# Anatomia da Virada 2026 — Análise Geoespacial de Transição Eleitoral (1ºT → 2ºT)

Aplicação web interativa de **data-storytelling e exploração geoespacial** em alta resolução para análise da transição de votos entre o 1º e o 2º turno da eleição presidencial brasileira de 2026 (**Candidatura 13 — Luiz Inácio Lula da Silva** vs. **Candidatura 22 — Flávio Bolsonaro**).

---

## 1. Escopo Territorial e Granularidade dos Dados

O projeto opera em três níveis integrados de resolução geográfica, cobrindo **100% do território nacional**:

1. **Nível Macro Nacional/Estadual (`zoom < 10`)**:
   - **5.570 municípios brasileiros** (mais Fernando de Noronha/Distrito Estadual, totalizando **5.571 registros oficiais IBGE/TSE** nas **27 Unidades da Federação**).
   - Renderização vetorial de alta performance em HTML5 Canvas (`L.canvas()`), permitindo navegação fluida sem gargalos de DOM.

2. **Nível Meso Municipal e Metropolitano (`zoom >= 10` — Setores de Votação / Polígonos de Voronoi Contíguos)**:
   - **56.652 Locais de Votação (Escolas / Colégios Eleitorais)** distribuídos por todos os municípios do país.
   - Ao aproximar o mapa para qualquer cidade ou região metropolitana (ex.: Grande São Paulo, Grande Rio, ABC Paulista, Recife/Olinda, BH/Contagem), o motor geométrico constrói uma **malha de Voronoi 100% contígua (zero lacunas e zero sobreposições)**.

3. **Nível Micro Intra-Escolar (Drill-down para Seções Eleitorais / Urnas)**:
   - **454.451 Seções Eleitorais (Urnas/Salas)** (~300 a 400 eleitores por seção).
   - Ao clicar em qualquer polígono de escola no mapa, a gaveta lateral (*Raio-X do Local de Votação*) exibe tanto o balanço agregado do edifício quanto a tabela individual pesquisável e ordenável de cada seção eleitoral daquela escola.

---

## 2. Malha Geométrica de Voronoi 100% Contígua (Sutherland–Hodgman)

Para evitar que os locais de votação apareçam como círculos isolados, hexágonos uniformes ou "ilhas" desconectadas com buracos entre bairros ou sobreposição entre municípios vizinhos:

1. **Agrupamento Urbano/Metropolitano por Componentes Conectados**:
   - Todos os locais de votação visíveis no *viewport* a menos de `0,22°` (~24 km) uns dos outros são reunidos em um único componente contíguo (unindo tanto os bairros de uma mesma cidade quanto municípios conurbados, como São Paulo, Osasco, Taboão da Serra, Guarulhos e ABC).
2. **Envelope Convexo Compartilhado (`buildSharedConvexEnvelope`)**:
   - Em vez de iniciar cada escola com um círculo individual pequeno (o que deixaria lacunas vazias onde duas escolas estivessem mais afastadas), todas as escolas do componente partem exatamente do **mesmo envelope convexo de 16 direções** que envolve todo o aglomerado urbano.
3. **Recorte Exato por Mediatrizes Perpendiculares (`clipPolygonByBisector` — Algoritmo de Sutherland–Hodgman)**:
   - Para cada par de escolas $(A, B)$ do componente, o semiplano definido pela mediatriz perpendicular (corrigida pela projeção métrica $\cos(\text{latitude})$) recorta o polígono de $A$ e o polígono de $B$ exatamente sobre a mesma reta matemática.
   - **Propriedade Matemática Garantida**: Os polígonos resultantes formam uma partição exata do envelope urbano — **100% colados aresta com aresta, sem buracos entre bairros e sem sobreposição entre municípios vizinhos**.

---

## 3. Modelo Matemático: Heurística de Balanço Proporcional por Seção

Como o voto no Brasil é secreto, não é possível rastrear eleitores individualmente, mas os Boletins de Urna (BUs) públicos do TSE fornecem os totais exatos do 1º e do 2º turno em cada seção eleitoral (~350 eleitores).

### 3.1. Setores com Crescimento Líquido da Candidatura 13 ($\Delta_{13} > 0$ e $\Delta_{22} \le 0$)

Para cada seção ou local de votação onde $\Delta_{13} = \text{Votos}_{13,2T} - \text{Votos}_{13,1T} > 0$, calculam-se quatro reservatórios de origem (*source pools*) disponíveis naquela mesma seção:

$$\text{Pool}_{\text{Transf 22}\to 13} = \max(0, \text{Votos}_{22, 1T} - \text{Votos}_{22, 2T})$$

$$\text{Pool}_{\text{Redução Abstenção}} = \max(0, \text{Abstenção}_{1T} - \text{Abstenção}_{2T})$$

$$\text{Pool}_{\text{Reversão BN}} = \max(0, \text{BrancosNulos}_{1T} - \text{BrancosNulos}_{2T})$$

$$\text{Pool}_{\text{3ª Via}} = \text{Votos nominais das demais candidaturas no 1º Turno}$$

Seja $S = \text{Pool}_{\text{Transf 22}\to 13} + \text{Pool}_{\text{Redução Abstenção}} + \text{Pool}_{\text{Reversão BN}} + \text{Pool}_{\text{3ª Via}}$. A atribuição estimada de $\Delta_{13}$ para cada vetor $k$ é dada por:

$$\text{Atribuição}_k = \text{round}\left( \Delta_{13} \times \frac{\text{Pool}_k}{S} \right)$$

### 3.2. Setores com Expansão da Candidatura 22 ($\Delta_{22} > 0$ ou $\Delta_{13} \le 0$)

Nos **938 municípios** e respectivos locais de votação onde a candidatura 13 não apresentou crescimento líquido ($\Delta_{13} \le 0$) e a candidatura 22 ampliou sua votação ($\Delta_{22} = \text{Votos}_{22, 2T} - \text{Votos}_{22, 1T} > 0$):
- Os quatro vetores de variação positiva para a candidatura 13 recebem atribuição zero e são explicitamente marcados na interface como **`Não se aplica (Δ13 ≤ 0)`**.
- O setor recebe a classificação **`Expansão da Candidatura 22 (Δ13 ≤ 0)`**, destacada em **Azul Ciano (`#0EA5E9`)**, exibindo o ganho líquido $+\Delta_{22}$ e a taxa percentual de expansão sobre o 1º turno.

---

## 4. Nomenclatura Analítica e Neutra

Para assegurar rigor metodológico e neutralidade descritiva (padrão de ciência política e jornalismo de dados), a aplicação adota a seguinte taxonomia técnica:

| Código Interno (`DominantFactorKey`) | Nomenclatura Técnica na Interface | Rótulo Curto | Cor Hex | Quando se aplica |
| :--- | :--- | :--- | :--- | :--- |
| `flavio_loss` | **Transferência Direta (22 → 13)** | `Transferência 22 → 13` | `#F43F5E` (Rose) | Redução nominal da candidatura 22 entre turnos acompanhada de crescimento da candidatura 13 |
| `abstention_drop` | **Comparecimento Adicional (Redução de Abstenção)** | `Redução de Abstenção` | `#F59E0B` (Amber) | Entrada líquida de eleitores que se abstiveram no 1º turno e compareceram no 2º turno |
| `third_way` | **Realinhamento da 3ª Via (→ 13)** | `Realinhamento 3ª Via` | `#A855F7` (Purple) | Migração líquida de eleitores de candidaturas não classificadas no 1º turno |
| `blank_null_drop` | **Reversão de Brancos e Nulos** | `Reversão Brancos/Nulos` | `#10B981` (Emerald) | Conversão líquida de votos em branco e nulos do 1º turno em votos válidos no 2º turno |
| `flavio_gain` | **Expansão da Candidatura 22 (Δ13 ≤ 0)** | `Expansão 22 (Δ13 ≤ 0)` | `#0EA5E9` (Sky Blue) | Locais onde $\Delta_{13} \le 0$ e $\Delta_{22} > 0$; os 4 vetores de $\Delta_{13} > 0$ são marcados como **Não se aplica** |

---

## 5. Estrutura de Diretórios do Repositório

```text
├── README.md                                 # Documentação técnica e metodológica completa
├── scripts/
│   ├── generateAll5570Municipios.ts          # Gerador offline dos 5.571 registros municipais IBGE/TSE (27 UFs)
│   └── generateOfflineData.ts                # Gerador offline dos setores pré-computados com malha Voronoi contígua
└── src/
    ├── App.tsx                               # Orquestração principal da aplicação, barra superior e modais
    ├── types/
    │   └── electoral.ts                      # Contratos TypeScript (SetorVotacao, SecaoEleitoral, MunicipioEleitoral)
    ├── data/
    │   ├── brasil5570Municipios.ts           # Base offline compacta com todos os 5.570 municípios brasileiros
    │   └── precomputedElectoralData.ts       # Setores pré-calculados, resumo nacional e roteiro do Tour Guiado
    ├── utils/
    │   ├── municipioVoronoiGenerator.ts      # Algoritmo Sutherland-Hodgman de malha Voronoi contígua sem buracos/sobreposições
    │   ├── heuristicEngine.ts                # Motor de balanço proporcional, metadados neutros e parser de CSV/JSON do TSE
    │   └── shareCardGenerator.ts             # Gerador de resumo para WhatsApp e Card PNG 1080x1350 via HTML5 Canvas
    └── components/
        ├── InteractiveElectoralMap.tsx       # Mapa Leaflet Dark com Canvas (5.570 cidades) + Malha Voronoi contígua
        ├── SearchAndCityPanel.tsx            # Busca instantânea por município, escola, bairro ou seção eleitoral
        ├── LayerSwitcherPanel.tsx            # Seletor de camadas temáticas e filtro de Expansão 22 (Δ13 ≤ 0)
        ├── XRaySideDrawer.tsx                # Gaveta lateral com decomposição por vetor e tabela de seções eleitorais
        ├── BottomAnalysisDock.tsx            # Painel expansível: Renda IBGE, Contexto Estadual e Decomposição Nacional
        ├── GuidedTourOverlay.tsx             # Tour guiado passo a passo pelos 5 padrões territoriais
        └── TseDataModal.tsx                  # Explorador da base nacional e importador de arquivos CSV/JSON de BUs do TSE
```

---

## 6. Como Executar e Regerar os Dados Offline

### Executar em ambiente de desenvolvimento
```bash
npm install
npm run dev
```

### Regerar os datasets estáticos offline (caso altere parâmetros demográficos ou sementes)
```bash
# 1. Regerar a base nacional dos 5.570 municípios (src/data/brasil5570Municipios.ts)
npx tsx scripts/generateAll5570Municipios.ts

# 2. Regerar os setores metropolitanos pré-computados (src/data/precomputedElectoralData.ts)
npx tsx scripts/generateOfflineData.ts
```

### Compilar para produção
```bash
npm run build
```

---

## 7. Publicação no Netlify (Pronto para Deploy)

O repositório já está configurado para publicação imediata no **Netlify** através dos arquivos:
- **`netlify.toml`**: Define automaticamente o comando de build (`npm run build`), o diretório de saída (`dist`), a versão do Node.js (`NODE_VERSION = "22"`), os cabeçalhos de cache imutável na CDN para `/data/brasil-geopolygons.json` e o redirecionamento SPA.
- **`public/_redirects`**: Garante que qualquer rota da Single-Page Application (`/*`) resolva para `/index.html` com status `200`.

### Opção A — Deploy Contínuo via GitHub / GitLab
1. Envie este repositório para o seu GitHub ou GitLab.
2. No painel do **Netlify**, clique em **Add new site → Import an existing project** e selecione o repositório.
3. O Netlify detectará automaticamente as configurações do `netlify.toml` (`Build command: npm run build`, `Publish directory: dist`). Basta clicar em **Deploy site**.

### Opção B — Deploy Manual (Netlify CLI ou Drag & Drop)
1. Gere a pasta estática de produção localmente:
   ```bash
   npm run build
   ```
2. Arraste a pasta `dist/` gerada diretamente para o [Netlify Drop](https://app.netlify.com/drop) ou publique via CLI:
   ```bash
   npx netlify-cli deploy --prod --dir=dist
   ```

