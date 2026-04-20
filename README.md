# Comparador de Precos (MVP)

Site publico para buscar produtos em marketplaces e comparar ofertas reais por menor preco verificado:

- Coleta e validacao de preco direto na pagina do produto
- Ranking do menor para o maior valor
- Ate 10 resultados (pode retornar menos quando nao houver ofertas validadas)

## Requisitos

- Node.js 22+
- npm

## Setup

```bash
npm install
cp .env.example .env
```

Para fallback headless, instale o navegador do Playwright:

```bash
npx playwright install chromium
```

## Executar

```bash
npm run dev
```

Abra no navegador:

- `http://localhost:3333`

## Endpoints principais

- `POST /api/searches`
- `GET /api/searches/:id`
- `GET /health`

## Observacoes

- O fluxo eh assincrono: crie a busca e consulte progresso via polling em `/api/searches/:id`.
- Endereco do usuario nao eh persistido em tabela de buscas.
- O cache do scraping usa hash de `query+CEP` por 10 minutos (configuravel em `SCRAPER_CACHE_TTL_MINUTES`).
- Se uma loja bloquear (captcha/anti-bot/timeout), ela eh ignorada e a busca segue com as demais.
- Runtime oficial de desenvolvimento: `src` com `npm run dev`.
- `npm start` recompila o `dist` antes de subir para evitar divergencia entre codigo-fonte e build.
