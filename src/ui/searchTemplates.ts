/**
 * Search Templates - Price Comparator UI
 * Renders the main search page with form, progress tracking, and results display
 * Updated design with money colors, dark/light theme, fire badges for hot deals
 */

// Brazilian Currency Images for animation
const CURRENCY_IMAGES = [
  { value: "R$1", image: "/assets/imgs/moeda1real-removebg-preview.png", shape: "coin" },
  { value: "R$2", image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/2reais-TuDEEPWvrsO4rLvb4nO0rTjF2f2vQW.jpg", shape: "note" },
  { value: "R$5", image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/5_front-NI7hk0BtdRZJ2iizWIXRkAdakW3FZv.jpg", shape: "note" },
  { value: "R$10", image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/10_front-WiRuX7ugknzlDDNjfyWCcJkD3V11gD.jpg", shape: "note" },
  { value: "R$20", image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/20_front-zCcpMzmy4k6oo4R9OBwOM9cQyBkzCx.jpg", shape: "note" },
  { value: "R$50", image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/50_front-VXa3y5la2UxshGZsgRoTb4eL3PLlKb.jpg", shape: "note" },
  { value: "R$100", image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/100_front-1zxefNQ0KiTPibgFkpD7v05Pm8swP4.jpg", shape: "note" },
];

export function renderSearchPage(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>garimpei - Comparador de Precos</title>
  <meta name="description" content="Compare precos em tempo real entre Amazon, Mercado Livre e Shopee. Encontre as melhores ofertas em segundos.">
  <link rel="icon" type="image/png" href="/assets/imgs/garimpei-logo.png">
  <link rel="apple-touch-icon" href="/assets/imgs/garimpei-logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${getStyles()}
  </style>
</head>
<body>
  <div class="app" id="app">
    <!-- Header -->
    <header class="header" id="header">
      <div class="header-content">
        <div class="logo">
          <div class="logo-icon">
            <img src="/assets/imgs/garimpei-logo.png" alt="garimpei">
          </div>
          <div class="logo-text-wrapper">
            <span class="logo-text">garimpei</span>
            <span class="logo-tagline">Economize de verdade</span>
          </div>
        </div>
        <button class="theme-toggle" id="themeToggle" aria-label="Alternar tema">
          <div class="theme-toggle-track">
            <div class="theme-toggle-thumb">
              <svg class="theme-icon moon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>
              </svg>
              <svg class="theme-icon sun" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>
              </svg>
            </div>
          </div>
        </button>
      </div>
    </header>

    <!-- Hero Section -->
    <section class="hero" id="heroSection">
      <div class="hero-bg">
        <div class="hero-blob hero-blob-1"></div>
        <div class="hero-blob hero-blob-2"></div>
        <div class="hero-blob hero-blob-3"></div>
        <div class="floating-coins" id="floatingCoins"></div>
      </div>
      <div class="hero-content">
        <div class="hero-text">
          <div class="hero-badge">
            <span class="hero-badge-dot"></span>
            Comparacao em tempo real
          </div>
          <h1 class="hero-title">
            Compare precos e <span class="text-gradient">economize dinheiro</span>
          </h1>
          <p class="hero-description">
            Buscamos simultaneamente na <strong class="text-orange">Amazon</strong>,
            <strong class="text-yellow">Mercado Livre</strong> e
            <strong class="text-orange-dark">Shopee</strong> para encontrar o menor preco garantido.
          </p>

          <!-- How it works -->
          <div class="hero-steps">
            <div class="hero-step">
              <div class="hero-step-number">1</div>
              <div class="hero-step-content">
                <h3>Pesquise</h3>
                <p>Digite o produto desejado</p>
              </div>
            </div>
            <div class="hero-step">
              <div class="hero-step-number">2</div>
              <div class="hero-step-content">
                <h3>Compare</h3>
                <p>Veja precos em 3 lojas</p>
              </div>
            </div>
            <div class="hero-step">
              <div class="hero-step-number">3</div>
              <div class="hero-step-content">
                <h3>Economize</h3>
                <p>Compre pelo menor preco</p>
              </div>
            </div>
          </div>

          <button class="hero-cta" id="heroCta">
            Comecar a economizar
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
            </svg>
          </button>
        </div>

        <div class="hero-currency">
          <div class="currency-animation ${CURRENCY_IMAGES[0].shape === "coin" ? "currency-shape-round" : "currency-shape-note"}" id="currencyAnimation">
            <img id="currencyImage" src="${CURRENCY_IMAGES[0].image}" alt="${CURRENCY_IMAGES[0].value}" class="currency-image">
            <div class="currency-glow"></div>
            <div class="currency-badge" id="currencyBadge">${CURRENCY_IMAGES[0].value}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Main Content -->
    <main class="main" id="mainContent">
      <!-- Search Section -->
      <section class="search-section" id="searchSection">
        <div class="search-card">
          <div class="search-header">
            <h2 class="search-title">Encontre o <span class="text-gradient">menor preco</span></h2>
            <p class="search-subtitle">Compare ofertas em 3 marketplaces simultaneamente</p>
          </div>

          <form id="searchForm" class="search-form">
            <!-- Product Input -->
            <div class="form-group form-group-product">
              <label for="product" class="form-label">
                <div class="label-icon-wrapper">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                Qual produto voce procura?
              </label>
              <input
                type="text"
                id="product"
                name="product"
                class="form-input form-input-lg"
                placeholder="Ex: iPhone 15 128GB, Samsung Galaxy S24, PS5..."
                required
                autocomplete="off"
              >
            </div>

            <!-- Address Section -->
            <div class="address-section">
              <div class="address-header">
                <div class="label-icon-wrapper label-icon-yellow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <span>Endereco de entrega</span>
              </div>

              <div class="form-grid">
                <div class="form-group form-group-cep">
                  <label for="zipCode" class="form-label-sm">CEP</label>
                  <input type="text" id="zipCode" name="zipCode" class="form-input" placeholder="00000-000" maxlength="9" required>
                </div>
                <div class="form-group form-group-street">
                  <label for="street" class="form-label-sm">Rua</label>
                  <input type="text" id="street" name="street" class="form-input" placeholder="Nome da rua" required>
                </div>
                <div class="form-group form-group-number">
                  <label for="number" class="form-label-sm">Numero</label>
                  <input type="text" id="number" name="number" class="form-input" placeholder="123" required>
                </div>
                <div class="form-group form-group-complement">
                  <label for="complement" class="form-label-sm">Complemento <span class="optional">(opcional)</span></label>
                  <input type="text" id="complement" name="complement" class="form-input" placeholder="Apto, bloco...">
                </div>
                <div class="form-group form-group-district">
                  <label for="district" class="form-label-sm">Bairro</label>
                  <input type="text" id="district" name="district" class="form-input" placeholder="Nome do bairro" required>
                </div>
                <div class="form-group form-group-city">
                  <label for="city" class="form-label-sm">Cidade</label>
                  <input type="text" id="city" name="city" class="form-input" placeholder="Nome da cidade" required>
                </div>
                <div class="form-group form-group-state">
                  <label for="state" class="form-label-sm">UF</label>
                  <select id="state" name="state" class="form-input form-select" required>
                    <option value="">UF</option>
                    ${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => `<option value="${uf}">${uf}</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>

            <!-- Submit Button -->
            <button type="submit" class="submit-btn" id="submitBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <span>Buscar melhores ofertas</span>
            </button>
          </form>

          <!-- Stores Badge -->
          <div class="stores-badge">
            <span class="stores-label">Buscamos em:</span>
            <div class="stores-logos">
              <div class="store-logo-mini" title="Amazon"><img src="/assets/store-logos/Amazon_icon.png" alt="Amazon" onerror="this.style.display='none'"></div>
              <div class="store-logo-mini" title="Mercado Livre"><img src="/assets/store-logos/Logotipo_MercadoLivre.png" alt="Mercado Livre" onerror="this.style.display='none'"></div>
              <div class="store-logo-mini" title="Shopee"><img src="/assets/store-logos/shopee-bag-logo-free-transparent-icon-17.png" alt="Shopee" onerror="this.style.display='none'"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Loading Section -->
      <section class="loading-section hidden" id="loadingSection">
        <div class="loading-card">
          <div class="loading-header">
            <div class="loading-spinner"></div>
            <h2 class="loading-title">Buscando as melhores ofertas</h2>
          </div>
          <p class="loading-query" id="loadingQuery"></p>
          <div class="progress-container">
            <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
            <div class="progress-info">
              <span class="progress-stage" id="progressStage">Iniciando busca...</span>
              <span class="progress-percent" id="progressPercent">0%</span>
            </div>
          </div>
          <div class="store-status" id="storeStatus">
            <div class="store-status-item" data-store="amazon">
              <div class="store-status-logo"><img src="/assets/store-logos/Amazon_icon.png" alt="Amazon" onerror="this.parentElement.innerHTML='<span>A</span>'"></div>
              <div class="store-status-info"><span class="store-status-name">Amazon</span><span class="store-status-count" id="amazonCount">Aguardando...</span></div>
              <div class="store-status-indicator" id="amazonIndicator"></div>
            </div>
            <div class="store-status-item" data-store="mercadolivre">
              <div class="store-status-logo"><img src="/assets/store-logos/Logotipo_MercadoLivre.png" alt="Mercado Livre" onerror="this.parentElement.innerHTML='<span>ML</span>'"></div>
              <div class="store-status-info"><span class="store-status-name">Mercado Livre</span><span class="store-status-count" id="mercadolivreCount">Aguardando...</span></div>
              <div class="store-status-indicator" id="mercadolivreIndicator"></div>
            </div>
            <div class="store-status-item" data-store="shopee">
              <div class="store-status-logo"><img src="/assets/store-logos/shopee-bag-logo-free-transparent-icon-17.png" alt="Shopee" onerror="this.parentElement.innerHTML='<span>S</span>'"></div>
              <div class="store-status-info"><span class="store-status-name">Shopee</span><span class="store-status-count" id="shopeeCount">Aguardando...</span></div>
              <div class="store-status-indicator" id="shopeeIndicator"></div>
            </div>
          </div>
          <button type="button" class="cancel-btn" id="cancelBtn">Cancelar busca</button>
        </div>
      </section>

      <!-- Results Section -->
      <section class="results-section hidden" id="resultsSection">
        <div class="results-header">
          <div class="results-header-main">
            <h2 class="results-title">
              <div class="results-icon-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                </svg>
              </div>
              Resultados para "<span id="resultsQuery"></span>"
            </h2>
            <p class="results-count" id="resultsCount"></p>
          </div>
          <button type="button" class="new-search-btn" id="newSearchBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            Nova busca
          </button>
        </div>
        <div class="diagnostics-bar" id="diagnosticsBar">
          <div class="diagnostic-item"><img src="/assets/store-logos/Amazon_icon.png" alt="Amazon" class="diagnostic-logo" onerror="this.style.display='none'"><span class="diagnostic-count" id="diagAmazon">0</span></div>
          <div class="diagnostic-item"><img src="/assets/store-logos/Logotipo_MercadoLivre.png" alt="Mercado Livre" class="diagnostic-logo" onerror="this.style.display='none'"><span class="diagnostic-count" id="diagMercadolivre">0</span></div>
          <div class="diagnostic-item"><img src="/assets/store-logos/shopee-bag-logo-free-transparent-icon-17.png" alt="Shopee" class="diagnostic-logo" onerror="this.style.display='none'"><span class="diagnostic-count" id="diagShopee">0</span></div>
        </div>
        <div class="results-grid" id="resultsGrid"></div>
        <div class="empty-state hidden" id="emptyState">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
          <h3 class="empty-title">Nenhuma oferta encontrada</h3>
          <p class="empty-description">Nao encontramos ofertas para este produto. Tente buscar com termos diferentes.</p>
          <button type="button" class="try-again-btn" id="tryAgainBtn">Tentar novamente</button>
        </div>
      </section>

      <!-- Error Section -->
      <section class="error-section hidden" id="errorSection">
        <div class="error-card">
          <div class="error-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg></div>
          <h3 class="error-title">Ops! Algo deu errado</h3>
          <p class="error-description" id="errorMessage">Nao foi possivel completar a busca. Por favor, tente novamente.</p>
          <button type="button" class="try-again-btn" id="errorRetryBtn">Tentar novamente</button>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <span class="footer-logo">garimpei</span>
      <p>&copy; 2024 Comparacao de precos em tempo real.</p>
    </footer>
  </div>

  <script>
    ${getScript()}
  </script>
</body>
</html>`;
}

function getStyles(): string {
  return `
    /* CSS Reset & Variables */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      /* Money Colors */
      --color-green-500: #22c55e;
      --color-green-600: #16a34a;
      --color-yellow-400: #facc15;
      --color-yellow-500: #eab308;
      --color-orange-400: #fb923c;
      --color-orange-500: #f97316;
      --color-orange-600: #ea580c;
      --color-gold: linear-gradient(135deg, #22c55e 0%, #facc15 50%, #f59e0b 100%);

      /* Light Theme */
      --bg-primary: #f8fafc;
      --bg-secondary: #ffffff;
      --bg-card: #ffffff;
      --bg-input: #ffffff;
      --bg-elevated: rgba(255,255,255,0.9);
      --border-color: #e2e8f0;
      --border-light: #f1f5f9;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --shadow-lg: 0 25px 50px -12px rgba(0,0,0,0.1);
      --shadow-glow: 0 0 80px rgba(34,197,94,0.1);
    }

    .dark {
      --bg-primary: #020617;
      --bg-secondary: #0f172a;
      --bg-card: rgba(15,23,42,0.8);
      --bg-input: #1e293b;
      --bg-elevated: rgba(15,23,42,0.9);
      --border-color: #1e293b;
      --border-light: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
      --shadow-lg: 0 25px 50px -12px rgba(0,0,0,0.5);
      --shadow-glow: 0 0 80px rgba(34,197,94,0.15);
    }

    html { font-size: 16px; -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg-primary); color: var(--text-primary); line-height: 1.6; min-height: 100vh; transition: background 0.3s, color 0.3s; }
    .app { display: flex; flex-direction: column; min-height: 100vh; }
    .hidden { display: none !important; }

    /* Utility Classes */
    .text-gradient { background: var(--color-gold); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .text-orange { color: var(--color-orange-500); }
    .text-yellow { color: var(--color-yellow-500); }
    .text-orange-dark { color: var(--color-orange-600); }

    /* Header */
    .header { position: sticky; top: 0; z-index: 100; background: var(--bg-elevated); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-color); padding: 0.75rem 1rem; transition: all 0.3s; }
    .header-content { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
    .logo { display: flex; align-items: center; gap: 0.75rem; }
    .logo-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; overflow: visible; background: transparent; flex-shrink: 0; }
    .logo-icon img { width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 8px 14px rgba(0,0,0,0.28)); }
    .logo-text-wrapper { display: flex; flex-direction: column; }
    .logo-text { font-size: 1.5rem; font-weight: 900; background: var(--color-gold); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.1; }
    .logo-tagline { font-size: 0.65rem; color: var(--text-muted); font-weight: 500; margin-top: -2px; }

    /* Theme Toggle */
    .theme-toggle { background: none; border: none; cursor: pointer; padding: 0; }
    .theme-toggle-track { width: 56px; height: 32px; border-radius: 16px; position: relative; transition: background 0.3s; }
    .dark .theme-toggle-track { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); }
    html:not(.dark) .theme-toggle-track { background: linear-gradient(135deg, #87CEEB 0%, #FDB813 100%); }
    .theme-toggle-thumb { position: absolute; top: 4px; width: 24px; height: 24px; border-radius: 50%; transition: all 0.3s; display: flex; align-items: center; justify-content: center; }
    .dark .theme-toggle-thumb { left: 4px; background: #1e293b; }
    html:not(.dark) .theme-toggle-thumb { left: 28px; background: #fbbf24; }
    .theme-icon { width: 16px; height: 16px; }
    .theme-icon.moon { color: #facc15; }
    .theme-icon.sun { color: #78350f; }
    .dark .theme-icon.sun { display: none; }
    html:not(.dark) .theme-icon.moon { display: none; }

    /* Hero Section */
    .hero { position: relative; overflow: hidden; padding: 3rem 1rem 4rem; }
    .dark .hero { background: var(--bg-primary); }
    html:not(.dark) .hero { background: linear-gradient(135deg, #ecfdf5 0%, #fef9c3 50%, #ffedd5 100%); }
    .hero-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .hero-blob { position: absolute; border-radius: 50%; filter: blur(80px); }
    .dark .hero-blob-1 { top: 5rem; left: 2rem; width: 18rem; height: 18rem; background: rgba(34,197,94,0.1); }
    .dark .hero-blob-2 { bottom: 2rem; right: 2rem; width: 24rem; height: 24rem; background: rgba(250,204,21,0.1); }
    .dark .hero-blob-3 { top: 50%; left: 50%; transform: translate(-50%,-50%); width: 40rem; height: 40rem; background: rgba(249,115,22,0.05); }
    html:not(.dark) .hero-blob-1 { top: 5rem; left: 2rem; width: 18rem; height: 18rem; background: rgba(34,197,94,0.3); }
    html:not(.dark) .hero-blob-2 { bottom: 2rem; right: 2rem; width: 24rem; height: 24rem; background: rgba(250,204,21,0.3); }
    html:not(.dark) .hero-blob-3 { top: 50%; left: 50%; transform: translate(-50%,-50%); width: 40rem; height: 40rem; background: rgba(249,115,22,0.1); }

    .floating-coins { position: absolute; inset: 0; }
    .floating-coin { position: absolute; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; animation: float 6s ease-in-out infinite; box-shadow: var(--shadow-md); }
    .dark .floating-coin { background: linear-gradient(135deg, #facc15 0%, #f59e0b 100%); color: #1e293b; }
    html:not(.dark) .floating-coin { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #1e293b; }

    @keyframes float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-20px) rotate(5deg); } }

    .hero-content { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 2.5rem; position: relative; z-index: 1; }
    @media (min-width: 1024px) { .hero-content { flex-direction: row; gap: 4rem; } }

    .hero-text { flex: 1; text-align: center; }
    @media (min-width: 1024px) { .hero-text { text-align: left; } }

    .hero-badge { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; margin-bottom: 1.5rem; }
    .dark .hero-badge { background: rgba(34,197,94,0.1); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
    html:not(.dark) .hero-badge { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .hero-badge-dot { position: relative; width: 8px; height: 8px; }
    .hero-badge-dot::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: #22c55e; animation: ping 1.5s infinite; }
    .hero-badge-dot::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: #22c55e; }
    @keyframes ping { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }

    .hero-title { font-size: 2.25rem; font-weight: 900; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.02em; }
    @media (min-width: 640px) { .hero-title { font-size: 3rem; } }
    @media (min-width: 1024px) { .hero-title { font-size: 3.75rem; } }

    .hero-description { font-size: 1.125rem; color: var(--text-secondary); margin-bottom: 2rem; max-width: 36rem; margin-left: auto; margin-right: auto; }
    @media (min-width: 1024px) { .hero-description { margin-left: 0; } }
    .hero-description strong { font-weight: 700; }

    /* Hero Steps */
    .hero-steps { display: grid; grid-template-columns: repeat(1, 1fr); gap: 1rem; margin-bottom: 2rem; }
    @media (min-width: 640px) { .hero-steps { grid-template-columns: repeat(3, 1fr); } }
    .hero-step { padding: 1rem; border-radius: 1rem; border: 1px solid var(--border-color); transition: all 0.3s; display: flex; align-items: flex-start; gap: 0.75rem; }
    .dark .hero-step { background: rgba(15,23,42,0.5); }
    html:not(.dark) .hero-step { background: rgba(255,255,255,0.8); box-shadow: var(--shadow-sm); }
    .hero-step:hover { transform: scale(1.02); }
    .dark .hero-step:hover { border-color: rgba(34,197,94,0.5); }
    html:not(.dark) .hero-step:hover { border-color: #86efac; }
    .hero-step-number { width: 2rem; height: 2rem; border-radius: 0.5rem; background: var(--color-gold); color: white; font-weight: 700; font-size: 0.875rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .hero-step-content h3 { font-weight: 700; font-size: 1rem; margin-bottom: 0.25rem; }
    .hero-step-content p { font-size: 0.875rem; color: var(--text-muted); }

    /* Hero CTA */
    .hero-cta { display: inline-flex; align-items: center; gap: 0.75rem; padding: 1rem 2rem; border-radius: 1rem; font-weight: 700; font-size: 1.125rem; color: white; border: none; cursor: pointer; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); box-shadow: 0 20px 40px -10px rgba(34,197,94,0.5); transition: all 0.3s; }
    .hero-cta:hover { transform: translateY(-2px); box-shadow: 0 25px 50px -10px rgba(34,197,94,0.6); }
    .hero-cta svg { width: 20px; height: 20px; transition: transform 0.3s; }
    .hero-cta:hover svg { transform: translateY(4px); }

    /* Currency Animation */
    .hero-currency { flex-shrink: 0; }
    .currency-animation { position: relative; perspective: 1000px; display: flex; align-items: center; justify-content: center; transition: width 0.3s, height 0.3s, border-radius 0.3s; }
    .currency-animation.currency-shape-round { width: 160px; height: 160px; aspect-ratio: 1 / 1; border-radius: 9999px; }
    .currency-animation.currency-shape-note { width: min(78vw, 260px); height: auto; aspect-ratio: 1.9 / 1; border-radius: 1rem; }
    @media (min-width: 768px) {
      .currency-animation.currency-shape-round { width: 224px; height: 224px; }
      .currency-animation.currency-shape-note { width: 320px; }
    }
    .currency-image { width: 100%; height: 100%; object-fit: contain; background: transparent; box-shadow: 0 25px 50px -12px rgba(34,197,94,0.4), 0 0 100px rgba(250,204,21,0.2); transition: transform 0.8s cubic-bezier(0.4,0,0.2,1), border-radius 0.3s; }
    .currency-shape-round .currency-image { border-radius: 9999px; }
    .currency-shape-note .currency-image { border-radius: 0.75rem; }
    .currency-image.flipping { transform: rotateY(180deg); }
    .currency-glow { position: absolute; inset: -1rem; border-radius: inherit; background: var(--color-gold); opacity: 0.5; filter: blur(40px); z-index: -1; }
    .currency-badge { position: absolute; bottom: -0.75rem; left: 50%; transform: translateX(-50%); padding: 0.375rem 1rem; border-radius: 9999px; font-weight: 900; font-size: 1.125rem; color: white; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); box-shadow: var(--shadow-lg); }

    /* Main Content */
    .main { flex: 1; padding: 2rem 1rem; max-width: 800px; margin: 0 auto; width: 100%; }
    @media (min-width: 640px) { .main { padding: 3rem 1.5rem; } }

    /* Search Card */
    .search-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 1.5rem; padding: 1.5rem; box-shadow: var(--shadow-lg), var(--shadow-glow); backdrop-filter: blur(12px); }
    @media (min-width: 640px) { .search-card { padding: 2rem; } }
    .search-header { text-align: center; margin-bottom: 2rem; }
    .search-title { font-size: 1.75rem; font-weight: 900; margin-bottom: 0.5rem; }
    @media (min-width: 640px) { .search-title { font-size: 2rem; } }
    .search-subtitle { color: var(--text-secondary); }

    /* Form */
    .search-form { display: flex; flex-direction: column; gap: 1.5rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
    .form-label { font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem; }
    .form-label-sm { font-size: 0.75rem; font-weight: 500; color: var(--text-muted); }
    .label-icon-wrapper { width: 24px; height: 24px; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; color: white; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
    .label-icon-wrapper svg { width: 14px; height: 14px; }
    .label-icon-yellow { background: linear-gradient(135deg, #facc15 0%, #f59e0b 100%); }
    .optional { color: var(--text-muted); font-weight: 400; }

    .form-input { width: 100%; background: var(--bg-input); border: 1.5px solid var(--border-light); border-radius: 0.75rem; padding: 0.75rem 1rem; font-size: 1rem; color: var(--text-primary); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03); transition: all 0.2s; }
    .dark .form-input { border-color: #475569; }
    html:not(.dark) .form-input { border-color: #cbd5e1; }
    .form-input::placeholder { color: var(--text-muted); }
    .form-input:focus { outline: none; border-color: var(--color-green-500); box-shadow: 0 0 0 3px rgba(34,197,94,0.2), inset 0 0 0 1px rgba(34,197,94,0.35); }
    .form-input-lg { padding: 1rem 1.25rem; font-size: 1.125rem; }
    .form-select { appearance: none; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; background-size: 1rem; padding-right: 2.5rem; }

    /* Address Section */
    .address-section { background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 1rem; padding: 1.25rem; }
    .address-header { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color); }
    .form-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1rem; }
    .form-group-cep { grid-column: span 2; }
    .form-group-street { grid-column: span 4; }
    .form-group-number { grid-column: span 2; }
    .form-group-complement { grid-column: span 4; }
    .form-group-district { grid-column: span 3; }
    .form-group-city { grid-column: span 2; }
    .form-group-state { grid-column: span 1; }
    @media (max-width: 639px) {
      .form-grid { grid-template-columns: 1fr; }
      .form-group-cep, .form-group-street, .form-group-number, .form-group-complement, .form-group-district, .form-group-city, .form-group-state { grid-column: span 1; }
    }

    /* Submit Button */
    .submit-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 1rem; border-radius: 1rem; font-size: 1.125rem; font-weight: 700; color: white; border: none; cursor: pointer; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); box-shadow: 0 20px 40px -10px rgba(34,197,94,0.4); transition: all 0.3s; }
    .submit-btn:hover { transform: translateY(-2px); box-shadow: 0 25px 50px -10px rgba(34,197,94,0.5); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .submit-btn svg { width: 20px; height: 20px; }

    /* Stores Badge */
    .stores-badge { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); }
    .stores-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; color: var(--text-muted); }
    .stores-logos { display: flex; gap: 0.75rem; }
    .store-logo-mini { width: 40px; height: 40px; border-radius: 0.75rem; overflow: hidden; border: 1px solid var(--border-color); transition: transform 0.3s; }
    .dark .store-logo-mini { background: var(--bg-input); }
    html:not(.dark) .store-logo-mini { background: white; box-shadow: var(--shadow-sm); }
    .store-logo-mini:hover { transform: scale(1.1); }
    .store-logo-mini img { width: 100%; height: 100%; object-fit: cover; }

    /* Loading Section */
    .loading-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 1.5rem; padding: 2rem; text-align: center; }
    .loading-header { display: flex; flex-direction: column; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
    .loading-spinner { width: 64px; height: 64px; border-radius: 50%; position: relative; }
    .loading-spinner::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(#22c55e 0%, #facc15 50%, #f59e0b 100%); animation: spin 1.5s linear infinite; }
    .loading-spinner::after { content: ''; position: absolute; inset: 8px; border-radius: 50%; background: var(--bg-card); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-title { font-size: 1.25rem; font-weight: 700; }
    .loading-query { color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem; }

    /* Progress */
    .progress-container { margin-bottom: 1.5rem; }
    .progress-bar { height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 0.75rem; }
    .dark .progress-bar { background: var(--bg-input); }
    html:not(.dark) .progress-bar { background: #f1f5f9; }
    .progress-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, #22c55e 0%, #facc15 50%, #f59e0b 100%); transition: width 0.3s; }
    .progress-info { display: flex; justify-content: space-between; font-size: 0.875rem; }
    .progress-stage { color: var(--text-secondary); }
    .progress-percent { font-weight: 700; color: var(--color-green-500); }

    /* Store Status */
    .store-status { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
    .store-status-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 0.75rem; border: 1px solid var(--border-color); }
    .dark .store-status-item { background: rgba(30,41,59,0.5); }
    html:not(.dark) .store-status-item { background: #f8fafc; }
    .store-status-logo { width: 40px; height: 40px; border-radius: 0.5rem; overflow: hidden; flex-shrink: 0; }
    .dark .store-status-logo { background: var(--bg-input); }
    html:not(.dark) .store-status-logo { background: white; box-shadow: var(--shadow-sm); }
    .store-status-logo img { width: 100%; height: 100%; object-fit: cover; }
    .store-status-info { flex: 1; text-align: left; }
    .store-status-name { display: block; font-size: 0.875rem; font-weight: 600; }
    .store-status-count { display: block; font-size: 0.75rem; color: var(--text-muted); }
    .store-status-indicator { width: 12px; height: 12px; border-radius: 50%; }
    .store-status-indicator.loading { background: #facc15; animation: pulse 1s infinite; }
    .store-status-indicator.complete { background: #22c55e; }
    .store-status-indicator.error { background: #ef4444; }
    .dark .store-status-indicator { background: #475569; }
    html:not(.dark) .store-status-indicator { background: #cbd5e1; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    .cancel-btn { padding: 0.625rem 1.5rem; border-radius: 0.75rem; font-size: 0.875rem; font-weight: 500; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; transition: all 0.2s; }
    .cancel-btn:hover { color: var(--text-primary); border-color: var(--border-light); }

    /* Results Section */
    .results-header { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
    @media (min-width: 640px) { .results-header { flex-direction: row; align-items: center; justify-content: space-between; } }
    .results-title { font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    @media (min-width: 640px) { .results-title { font-size: 1.5rem; } }
    .results-icon-wrapper { width: 32px; height: 32px; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; color: white; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
    .results-icon-wrapper svg { width: 16px; height: 16px; }
    .results-count { font-size: 0.875rem; color: var(--text-muted); margin-top: 0.25rem; }
    .new-search-btn { display: flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1rem; border-radius: 0.75rem; font-size: 0.875rem; font-weight: 600; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); cursor: pointer; transition: all 0.2s; }
    .new-search-btn:hover { border-color: var(--border-light); }
    .new-search-btn svg { width: 16px; height: 16px; }

    /* Diagnostics */
    .diagnostics-bar { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; overflow-x: auto; padding-bottom: 0.25rem; }
    .diagnostic-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1rem; border-radius: 0.75rem; border: 1px solid var(--border-color); flex-shrink: 0; }
    .dark .diagnostic-item { background: rgba(15,23,42,0.8); }
    html:not(.dark) .diagnostic-item { background: white; box-shadow: var(--shadow-sm); }
    .diagnostic-logo { width: 24px; height: 24px; border-radius: 0.375rem; object-fit: cover; }
    .diagnostic-count { font-size: 0.875rem; font-weight: 700; background: var(--color-gold); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

    /* Results Grid */
    .results-grid { display: flex; flex-direction: column; gap: 1rem; }

    /* Product Card */
    .product-card { position: relative; border-radius: 1rem; overflow: hidden; border: 1px solid var(--border-color); transition: all 0.3s; }
    .dark .product-card { background: rgba(15,23,42,0.8); }
    html:not(.dark) .product-card { background: white; box-shadow: var(--shadow-md); }
    .product-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .dark .product-card:hover { border-color: rgba(34,197,94,0.5); }
    html:not(.dark) .product-card:hover { border-color: #86efac; }
    .product-card.hot-deal { box-shadow: 0 0 40px rgba(249,115,22,0.15); }
    .product-card.hot-deal::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(234,88,12,0.05) 100%); pointer-events: none; z-index: 0; }

    .product-card-inner { display: flex; flex-direction: column; position: relative; z-index: 1; }
    @media (min-width: 640px) { .product-card-inner { flex-direction: row; } }

    .product-image { position: relative; width: 100%; aspect-ratio: 1; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    @media (min-width: 640px) { .product-image { width: 192px; aspect-ratio: auto; } }
    .dark .product-image { background: var(--bg-input); }
    html:not(.dark) .product-image { background: #f8fafc; }
    .product-image img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 1rem; }
    .product-image-placeholder { color: var(--text-muted); }
    .product-image-placeholder svg { width: 64px; height: 64px; }

    /* Rank Badge */
    .rank-badge { position: absolute; top: 0.75rem; left: 0.75rem; z-index: 10; padding: 0.375rem 0.75rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 900; box-shadow: var(--shadow-md); }
    .rank-badge.rank-1 { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #1e293b; }
    .rank-badge.rank-2 { background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); color: white; }
    .rank-badge.rank-3 { background: linear-gradient(135deg, #d97706 0%, #b45309 100%); color: white; }
    .dark .rank-badge.rank-default { background: #1e293b; border: 1px solid var(--border-color); color: white; }
    html:not(.dark) .rank-badge.rank-default { background: #f1f5f9; color: #1e293b; }

    /* Fire Badge */
    .fire-badge { position: absolute; top: -8px; right: -8px; z-index: 20; }
    .fire-badge svg { width: 40px; height: 40px; filter: drop-shadow(0 4px 8px rgba(249,115,22,0.4)); }
    .fire-badge-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 8px; font-weight: 900; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
    .fire-badge-pulse { position: absolute; inset: 0; animation: fire-pulse 1s infinite; }
    @keyframes fire-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } }

    /* Product Content */
    .product-content { flex: 1; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .product-badges { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .store-badge { display: flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.5rem; border-radius: 0.5rem; }
    .dark .store-badge { background: var(--bg-input); }
    html:not(.dark) .store-badge { background: #f1f5f9; }
    .store-badge img { width: 16px; height: 16px; border-radius: 0.25rem; object-fit: cover; }
    .store-badge span { font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); }
    .match-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.25rem 0.5rem; border-radius: 0.375rem; }
    .match-badge.exact { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
    .match-badge.similar { background: rgba(250,204,21,0.1); color: #ca8a04; border: 1px solid rgba(250,204,21,0.2); }
    .hot-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.25rem 0.5rem; border-radius: 0.375rem; background: rgba(249,115,22,0.1); color: #f97316; border: 1px solid rgba(249,115,22,0.2); animation: pulse 2s infinite; }

    .product-title { font-size: 0.875rem; font-weight: 600; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    @media (min-width: 640px) { .product-title { font-size: 1rem; } }

    .product-warnings { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .warning-badge { font-size: 10px; display: flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; border-radius: 0.375rem; background: rgba(245,158,11,0.1); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); }
    .warning-badge svg { width: 10px; height: 10px; }

    .product-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-top: auto; padding-top: 0.75rem; }
    .product-price { font-size: 1.75rem; font-weight: 900; background: var(--color-gold); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .product-verified { display: flex; align-items: center; gap: 0.25rem; font-size: 11px; color: var(--text-muted); margin-top: 0.25rem; }
    .product-verified svg { width: 12px; height: 12px; color: var(--color-green-500); }

    .product-cta { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.25rem; border-radius: 0.75rem; font-size: 0.875rem; font-weight: 700; color: white; text-decoration: none; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); box-shadow: 0 10px 25px -5px rgba(34,197,94,0.4); transition: all 0.3s; flex-shrink: 0; }
    .product-cta:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(34,197,94,0.5); }
    .product-cta svg { width: 16px; height: 16px; }

    /* Empty State */
    .empty-state { text-align: center; padding: 3rem 1rem; border-radius: 1rem; border: 1px solid var(--border-color); }
    .dark .empty-state { background: rgba(15,23,42,0.8); }
    html:not(.dark) .empty-state { background: white; }
    .empty-icon { width: 80px; height: 80px; margin: 0 auto 1rem; border-radius: 1rem; display: flex; align-items: center; justify-content: center; }
    .dark .empty-icon { background: var(--bg-input); color: var(--text-muted); }
    html:not(.dark) .empty-icon { background: #f1f5f9; color: #94a3b8; }
    .empty-icon svg { width: 40px; height: 40px; }
    .empty-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; }
    .empty-description { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; }
    .try-again-btn { padding: 0.625rem 1.5rem; border-radius: 0.75rem; font-size: 0.875rem; font-weight: 500; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; transition: all 0.2s; }
    .try-again-btn:hover { color: var(--text-primary); border-color: var(--border-light); }

    /* Error Section */
    .error-card { text-align: center; padding: 2rem; border-radius: 1.5rem; border: 1px solid var(--border-color); }
    .dark .error-card { background: rgba(15,23,42,0.8); }
    html:not(.dark) .error-card { background: white; box-shadow: var(--shadow-lg); }
    .error-icon { width: 80px; height: 80px; margin: 0 auto 1rem; border-radius: 1rem; display: flex; align-items: center; justify-content: center; }
    .dark .error-icon { background: rgba(239,68,68,0.1); }
    html:not(.dark) .error-icon { background: #fef2f2; }
    .error-icon svg { width: 40px; height: 40px; color: #ef4444; }
    .error-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; }
    .error-description { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; }

    /* Footer */
    .footer { text-align: center; padding: 2rem 1rem; font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid var(--border-color); }
    .footer-logo { display: block; font-weight: 900; margin-bottom: 0.5rem; background: var(--color-gold); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    .dark ::-webkit-scrollbar-track { background: #1e293b; }
    html:not(.dark) ::-webkit-scrollbar-track { background: #f1f5f9; }
    .dark ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
    html:not(.dark) ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #64748b; }

    /* Selection */
    ::selection { background: rgba(34,197,94,0.3); }
  `;
}

function getScript(): string {
  return `
    // Currency images for animation
    const CURRENCY_IMAGES = ${JSON.stringify(CURRENCY_IMAGES)};

    // Stage labels
    const STAGE_LABELS = {
      queued: 'Aguardando inicio...',
      collecting: 'Coletando ofertas...',
      matching: 'Validando produtos...',
      enriching: 'Verificando precos...',
      ranking: 'Ranqueando ofertas...',
      completed: 'Busca concluida!',
      failed: 'Busca falhou'
    };

    const STORE_NAMES = {
      amazon: 'Amazon',
      mercadolivre: 'Mercado Livre',
      mercado_livre: 'Mercado Livre',
      shopee: 'Shopee'
    };

    const STORE_LOGOS = {
      amazon: '/assets/store-logos/Amazon_icon.png',
      mercadolivre: '/assets/store-logos/Logotipo_MercadoLivre.png',
      shopee: '/assets/store-logos/shopee-bag-logo-free-transparent-icon-17.png'
    };

    // State
    let searchId = null;
    let activeSearchId = null;
    let searchSequence = 0;
    let pollingInterval = null;
    let currencyIndex = 0;
    let currencyInterval = null;

    // DOM Elements
    const app = document.getElementById('app');
    const themeToggle = document.getElementById('themeToggle');
    const heroSection = document.getElementById('heroSection');
    const heroCta = document.getElementById('heroCta');
    const mainContent = document.getElementById('mainContent');
    const searchSection = document.getElementById('searchSection');
    const loadingSection = document.getElementById('loadingSection');
    const resultsSection = document.getElementById('resultsSection');
    const errorSection = document.getElementById('errorSection');
    const searchForm = document.getElementById('searchForm');
    const zipCodeInput = document.getElementById('zipCode');
    const currencyAnimation = document.getElementById('currencyAnimation');
    const currencyImage = document.getElementById('currencyImage');
    const currencyBadge = document.getElementById('currencyBadge');
    const floatingCoins = document.getElementById('floatingCoins');

    function escapeHtml(raw) {
      return String(raw ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function safeExternalUrl(raw) {
      const value = String(raw ?? '').trim();
      return /^https?:\\/\\//i.test(value) ? escapeHtml(value) : '#';
    }

    function safeImageUrl(raw) {
      const value = String(raw ?? '').trim();
      return /^https?:\\/\\//i.test(value) ? escapeHtml(value) : '';
    }

    function normalizeStoreKey(raw) {
      const key = String(raw ?? '').toLowerCase().replaceAll('_', '');
      return Object.prototype.hasOwnProperty.call(STORE_LOGOS, key) ? key : '';
    }

    function getStoreInfo(raw) {
      const key = normalizeStoreKey(raw);
      return {
        key,
        name: STORE_NAMES[key] || String(raw || 'Loja'),
        logo: key ? STORE_LOGOS[key] : ''
      };
    }

    // Theme
    function initTheme() {
      const saved = localStorage.getItem('theme');
      if (saved === 'light') {
        document.documentElement.classList.remove('dark');
      } else if (saved === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        if (window.matchMedia('(prefers-color-scheme: light)').matches) {
          document.documentElement.classList.remove('dark');
        }
      }
    }

    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    themeToggle.addEventListener('click', toggleTheme);
    initTheme();

    function applyCurrencyShape(item) {
      const isCoin = item.shape === 'coin';
      currencyAnimation.classList.toggle('currency-shape-round', isCoin);
      currencyAnimation.classList.toggle('currency-shape-note', !isCoin);
    }

    // Currency Animation
    function startCurrencyAnimation() {
      currencyInterval = setInterval(() => {
        currencyImage.classList.add('flipping');
        setTimeout(() => {
          currencyIndex = (currencyIndex + 1) % CURRENCY_IMAGES.length;
          const currency = CURRENCY_IMAGES[currencyIndex];
          currencyImage.src = currency.image;
          currencyImage.alt = currency.value;
          currencyBadge.textContent = currency.value;
          applyCurrencyShape(currency);
          currencyImage.classList.remove('flipping');
        }, 400);
      }, 2500);
    }

    // Floating Coins
    function createFloatingCoins() {
      for (let i = 0; i < 6; i++) {
        const coin = document.createElement('div');
        coin.className = 'floating-coin';
        coin.textContent = '$';
        coin.style.left = (10 + i * 15) + '%';
        coin.style.top = (20 + (i % 3) * 25) + '%';
        coin.style.animationDelay = (i * 0.5) + 's';
        coin.style.animationDuration = (4 + i) + 's';
        floatingCoins.appendChild(coin);
      }
    }

    createFloatingCoins();
    startCurrencyAnimation();

    // Hero CTA
    heroCta.addEventListener('click', () => {
      mainContent.scrollIntoView({ behavior: 'smooth' });
    });

    // CEP formatting and auto-fill
    zipCodeInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\\D/g, '');
      if (value.length > 5) {
        value = value.slice(0, 5) + '-' + value.slice(5, 8);
      }
      e.target.value = value;
    });

    zipCodeInput.addEventListener('blur', async (e) => {
      const cep = e.target.value.replace(/\\D/g, '');
      if (cep.length === 8) {
        try {
          const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
          const data = await response.json();
          if (!data.erro) {
            document.getElementById('street').value = data.logradouro || '';
            document.getElementById('district').value = data.bairro || '';
            document.getElementById('city').value = data.localidade || '';
            document.getElementById('state').value = data.uf || '';
          }
        } catch (err) {}
      }
    });

    // Form submission
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      stopPolling();
      searchSequence += 1;
      const sequence = searchSequence;
      searchId = null;
      activeSearchId = null;
      const formData = new FormData(searchForm);
      const query = String(formData.get('product') || '').trim();

      const address = {
        street: String(formData.get('street') || '').trim(),
        number: String(formData.get('number') || '').trim(),
        district: String(formData.get('district') || '').trim(),
        city: String(formData.get('city') || '').trim(),
        state: String(formData.get('state') || '').trim().toUpperCase(),
        zipCode: String(formData.get('zipCode') || '').trim(),
        complement: String(formData.get('complement') || '').trim() || null
      };

      showLoading(query);

      try {
        const response = await fetch('/api/searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, address, forceRefresh: true })
        });

        if (!response.ok) throw new Error('Failed to create search');

        const result = await response.json();
        if (sequence !== searchSequence) return;
        searchId = result.searchId;
        activeSearchId = searchId;
        startPolling(searchId, sequence);
      } catch (err) {
        if (sequence !== searchSequence) return;
        showError('Nao foi possivel iniciar a busca. Por favor, tente novamente.');
      }
    });

    // Show/hide sections
    function showLoading(query) {
      heroSection.classList.add('hidden');
      searchSection.classList.add('hidden');
      loadingSection.classList.remove('hidden');
      resultsSection.classList.add('hidden');
      errorSection.classList.add('hidden');
      document.getElementById('loadingQuery').textContent = 'Buscando: "' + query + '"';
      resetProgress();
    }

    function showResults(data) {
      heroSection.classList.add('hidden');
      searchSection.classList.add('hidden');
      loadingSection.classList.add('hidden');
      resultsSection.classList.remove('hidden');
      errorSection.classList.add('hidden');
      renderResults(data);
    }

    function showError(message) {
      heroSection.classList.add('hidden');
      searchSection.classList.add('hidden');
      loadingSection.classList.add('hidden');
      resultsSection.classList.add('hidden');
      errorSection.classList.remove('hidden');
      document.getElementById('errorMessage').textContent = message;
    }

    function showSearch() {
      searchSequence += 1;
      stopPolling();
      heroSection.classList.remove('hidden');
      searchSection.classList.remove('hidden');
      loadingSection.classList.add('hidden');
      resultsSection.classList.add('hidden');
      errorSection.classList.add('hidden');
      searchId = null;
      activeSearchId = null;
    }

    // Polling
    function startPolling(expectedSearchId, sequence) {
      pollStatus(expectedSearchId, sequence);
      pollingInterval = setInterval(() => pollStatus(expectedSearchId, sequence), 1500);
    }

    function stopPolling() {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }

    async function pollStatus(expectedSearchId, sequence) {
      if (!expectedSearchId || expectedSearchId !== activeSearchId || sequence !== searchSequence) return;

      try {
        const response = await fetch('/api/searches/' + encodeURIComponent(expectedSearchId));
        const data = await response.json();
        if (expectedSearchId !== activeSearchId || sequence !== searchSequence) return;
        if (!response.ok) throw new Error(data.error || 'Erro ao consultar busca');
        updateProgress(data);

        if (data.status === 'completed') {
          stopPolling();
          showResults(data);
        } else if (data.status === 'failed') {
          stopPolling();
          showError(data.errorMessage || 'Nao foi possivel completar a busca.');
        }
      } catch (err) {
        if (expectedSearchId !== activeSearchId || sequence !== searchSequence) return;
        stopPolling();
        showError('Erro de conexao. Verifique sua internet.');
      }
    }

    function resetProgress() {
      document.getElementById('progressFill').style.width = '0%';
      document.getElementById('progressPercent').textContent = '0%';
      document.getElementById('progressStage').textContent = 'Iniciando busca...';
      ['amazon', 'mercadolivre', 'shopee'].forEach(store => {
        document.getElementById(store + 'Count').textContent = 'Aguardando...';
        document.getElementById(store + 'Indicator').className = 'store-status-indicator';
      });
    }

    function updateProgress(data) {
      const percent = data.progressPercent || 0;
      document.getElementById('progressFill').style.width = percent + '%';
      document.getElementById('progressPercent').textContent = percent + '%';
      document.getElementById('progressStage').textContent = STAGE_LABELS[data.stage] || data.stage;

      if (data.audit && data.audit.stores) {
        data.audit.stores.forEach(store => {
          const name = normalizeStoreKey(store.store);
          if (!name) return;
          const countEl = document.getElementById(name + 'Count');
          const indicatorEl = document.getElementById(name + 'Indicator');

          if (countEl) {
            countEl.textContent = store.fetched !== undefined
              ? store.fetched + ' produtos encontrados'
              : 'Aguardando...';
          }

          if (indicatorEl) {
            if (store.errors && store.errors.length > 0 && !store.fetched) {
              indicatorEl.className = 'store-status-indicator error';
            } else if (store.fetched !== undefined) {
              indicatorEl.className = 'store-status-indicator complete';
            } else if (data.status === 'running') {
              indicatorEl.className = 'store-status-indicator loading';
            }
          }
        });
      }
    }

    function formatPrice(price) {
      const numeric = Number(price);
      if (!Number.isFinite(numeric)) return '-';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric);
    }

    function renderResults(data) {
      document.getElementById('resultsQuery').textContent = data.query;
      const results = data.results || [];
      document.getElementById('resultsCount').textContent = results.length + ' oferta' + (results.length !== 1 ? 's' : '') + ' encontrada' + (results.length !== 1 ? 's' : '');

      // Diagnostics
      if (data.audit && data.audit.stores) {
        data.audit.stores.forEach(store => {
          const name = normalizeStoreKey(store.store);
          if (!name) return;
          const el = document.getElementById('diag' + name.charAt(0).toUpperCase() + name.slice(1));
          if (el) el.textContent = store.fetched || 0;
        });
      }

      const grid = document.getElementById('resultsGrid');
      const emptyState = document.getElementById('emptyState');

      if (results.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
      }

      emptyState.classList.add('hidden');
      grid.innerHTML = results.map(result => renderProductCard(result)).join('');
    }

    function renderImagePlaceholder(extraClass) {
      return '<div class="product-image-placeholder ' + (extraClass || '') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>';
    }

    function renderProductCard(result) {
      const storeInfo = getStoreInfo(result.store);
      const storeName = escapeHtml(storeInfo.name);
      const storeLogo = storeInfo.logo ? escapeHtml(storeInfo.logo) : '';
      const url = safeExternalUrl(result.affiliateUrl || result.productUrl);
      const isExact = result.matchType === 'exact';
      const rank = Number(result.rank) || 0;
      const isHotDeal = rank > 0 && rank <= 3;
      const safeTitle = escapeHtml(result.title || 'Produto sem titulo');
      const productImageUrl = safeImageUrl(result.imageUrl);

      let rankClass = 'rank-default';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const imageHtml = productImageUrl
        ? '<img src="' + productImageUrl + '" alt="' + safeTitle + '" onerror="this.style.display=\\'none\\'; this.nextElementSibling.classList.remove(\\'hidden\\');"/>' + renderImagePlaceholder('hidden')
        : renderImagePlaceholder('');

      const fireBadge = isHotDeal ? '<div class="fire-badge"><div class="fire-badge-pulse"><svg viewBox="0 0 24 24" fill="url(#fireGrad)"><defs><linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stop-color="#f59e0b"/><stop offset="50%" stop-color="#f97316"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs><path d="M12 23c-3.866 0-7-3.134-7-7 0-2.5 1.5-4.5 3-6.5s3-4.5 3-7.5c0 3 1.5 5.5 3 7.5s3 4 3 6.5c0 3.866-3.134 7-7 7z"/></svg></div><svg viewBox="0 0 24 24" fill="url(#fireGrad)"><path d="M12 23c-3.866 0-7-3.134-7-7 0-2.5 1.5-4.5 3-6.5s3-4.5 3-7.5c0 3 1.5 5.5 3 7.5s3 4 3 6.5c0 3.866-3.134 7-7 7z"/></svg><span class="fire-badge-text">HOT</span></div>' : '';

      const hotBadge = isHotDeal ? '<span class="hot-badge">Oferta Quente</span>' : '';

      const warningsHtml = result.warnings && result.warnings.length > 0
        ? '<div class="product-warnings">' + result.warnings.map(w => '<span class="warning-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' + escapeHtml(w) + '</span>').join('') + '</div>'
        : '';

      return '<article class="product-card' + (isHotDeal ? ' hot-deal' : '') + '">' +
        fireBadge +
        '<div class="product-card-inner">' +
          '<div class="product-image">' +
            '<span class="rank-badge ' + rankClass + '">#' + rank + '</span>' +
            imageHtml +
          '</div>' +
          '<div class="product-content">' +
            '<div class="product-badges">' +
              '<div class="store-badge">' + (storeLogo ? '<img src="' + storeLogo + '" alt="' + storeName + '" onerror="this.style.display=\\'none\\'">' : '') + '<span>' + storeName + '</span></div>' +
              '<span class="match-badge ' + (isExact ? 'exact' : 'similar') + '">' + (isExact ? 'Preco validado' : 'Correspondencia aproximada') + '</span>' +
              hotBadge +
            '</div>' +
            '<h3 class="product-title">' + safeTitle + '</h3>' +
            warningsHtml +
            '<div class="product-footer">' +
              '<div>' +
                '<div class="product-price">' + formatPrice(result.verifiedPrice) + '</div>' +
                '<div class="product-verified"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/></svg>Preco verificado</div>' +
              '</div>' +
              '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="product-cta">Ver oferta<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg></a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    }

    // Event listeners for buttons
    document.getElementById('cancelBtn').addEventListener('click', showSearch);
    document.getElementById('newSearchBtn').addEventListener('click', showSearch);
    document.getElementById('tryAgainBtn').addEventListener('click', showSearch);
    document.getElementById('errorRetryBtn').addEventListener('click', showSearch);
  `;
}
