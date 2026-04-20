export function renderSearchPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Comparador de Precos</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-0: #09060f;
      --bg-1: #130c1f;
      --bg-2: #1b1230;
      --surface: rgba(22, 14, 33, 0.94);
      --surface-soft: rgba(32, 20, 45, 0.88);
      --text: #f8efdf;
      --muted: #c4b59f;
      --accent-gold: #e3b96f;
      --accent-gold-strong: #f2ce8f;
      --accent-emerald: #2cc5a7;
      --danger: #ff6f8c;
      --warning: #f4c87d;
      --success: #8bf5cd;
      --border: rgba(230, 189, 122, 0.28);
      --border-soft: rgba(230, 189, 122, 0.18);
      --radius-xl: 24px;
      --radius-lg: 16px;
      --radius-md: 12px;
      --shadow-lg: 0 26px 54px rgba(0, 0, 0, 0.45);
      --shadow-md: 0 16px 34px rgba(0, 0, 0, 0.38);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Manrope", "Segoe UI", sans-serif;
      color: var(--text);
      line-height: 1.45;
      background:
        radial-gradient(circle at 10% -10%, rgba(151, 96, 222, 0.24), transparent 35%),
        radial-gradient(circle at 100% -20%, rgba(44, 197, 167, 0.18), transparent 32%),
        linear-gradient(160deg, var(--bg-2), var(--bg-1) 50%, var(--bg-0));
      overflow-x: hidden;
    }

    .bg-noise {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: -1;
      background:
        repeating-linear-gradient(
          110deg,
          rgba(255, 255, 255, 0.02) 0,
          rgba(255, 255, 255, 0.02) 1px,
          transparent 1px,
          transparent 24px
        );
      opacity: 0.42;
    }

    .orb {
      position: fixed;
      border-radius: 999px;
      pointer-events: none;
      z-index: -1;
      filter: blur(2px);
      mix-blend-mode: screen;
    }

    .orb-a {
      width: 280px;
      height: 280px;
      left: -90px;
      top: 12%;
      background: radial-gradient(circle, rgba(239, 191, 113, 0.28), rgba(239, 191, 113, 0));
      animation: floatA 14s ease-in-out infinite;
    }

    .orb-b {
      width: 360px;
      height: 360px;
      right: -130px;
      top: 38%;
      background: radial-gradient(circle, rgba(64, 221, 184, 0.24), rgba(64, 221, 184, 0));
      animation: floatB 16s ease-in-out infinite;
    }

    .wrap {
      width: min(1200px, calc(100% - 30px));
      margin: 0 auto;
      padding: 28px 0 54px;
      position: relative;
      z-index: 2;
    }

    .panel {
      position: relative;
      border-radius: var(--radius-xl);
      background: linear-gradient(165deg, var(--surface), var(--surface-soft));
      border: 1px solid var(--border-soft);
      box-shadow: var(--shadow-lg);
      backdrop-filter: blur(4px);
      overflow: hidden;
    }

    .panel::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      padding: 1px;
      background: linear-gradient(130deg, rgba(245, 206, 141, 0.36), rgba(245, 206, 141, 0), rgba(68, 219, 184, 0.26));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0.65;
    }

    h1, .search-shell__head h2, .results-head h2 {
      font-family: "Playfair Display", Georgia, serif;
      letter-spacing: 0.01em;
    }

    .reveal {
      opacity: 0;
      transform: translateY(24px) scale(0.99);
      animation: revealIn 720ms cubic-bezier(0.2, 0.65, 0.22, 1) forwards;
    }

    .step-1 { animation-delay: 60ms; }
    .step-2 { animation-delay: 180ms; }
    .step-3 { animation-delay: 290ms; }
    .step-4 { animation-delay: 380ms; }

    .hero {
      padding: 30px;
      margin-bottom: 16px;
      isolation: isolate;
    }

    .hero::after {
      content: "";
      position: absolute;
      width: 420px;
      height: 420px;
      right: -160px;
      top: -210px;
      background: radial-gradient(circle, rgba(248, 205, 132, 0.27), rgba(248, 205, 132, 0));
      z-index: -1;
      animation: pulseGlow 10s ease-in-out infinite;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
      gap: 20px;
      align-items: stretch;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 13px;
      border-radius: 999px;
      border: 1px solid rgba(245, 206, 141, 0.45);
      background: rgba(245, 206, 141, 0.1);
      color: var(--accent-gold-strong);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.11em;
      text-transform: uppercase;
      box-shadow: 0 0 24px rgba(239, 191, 113, 0.22);
    }

    h1 {
      margin: 14px 0 12px;
      font-size: clamp(2rem, 4.8vw, 3.4rem);
      line-height: 1.03;
      text-wrap: balance;
      max-width: 760px;
      text-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    }

    .hero p {
      margin: 0;
      color: var(--muted);
      max-width: 760px;
      font-size: 1.01rem;
    }

    .hero-badges {
      margin-top: 18px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .hero-badge {
      border: 1px solid rgba(245, 206, 141, 0.3);
      border-radius: var(--radius-md);
      padding: 10px 11px;
      background: linear-gradient(155deg, rgba(255, 240, 214, 0.07), rgba(255, 240, 214, 0.02));
    }

    .hero-badge strong {
      display: block;
      color: #fff2d8;
      margin-bottom: 2px;
      font-size: 1.04rem;
    }

    .hero-badge span {
      display: block;
      font-size: 0.8rem;
      color: var(--muted);
    }

    .hero-side {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 15px;
      background: linear-gradient(160deg, rgba(21, 14, 33, 0.9), rgba(29, 18, 41, 0.82));
      box-shadow: inset 0 0 0 1px rgba(247, 205, 132, 0.08), var(--shadow-md);
      display: grid;
      align-content: center;
      gap: 8px;
    }

    .hero-side h3 {
      margin: 0;
      color: #f8ddb0;
      font-size: 1rem;
    }

    .hero-side p {
      margin: 0;
      font-size: 0.9rem;
    }

    .hero-list {
      margin: 2px 0 0;
      padding-left: 18px;
      display: grid;
      gap: 5px;
      font-size: 0.84rem;
      color: var(--muted);
    }

    .search-shell {
      padding: 24px;
      margin-bottom: 16px;
      background: linear-gradient(165deg, rgba(20, 14, 30, 0.96), rgba(30, 18, 44, 0.9));
    }

    .search-shell__head {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 14px;
      flex-wrap: wrap;
    }

    .search-shell__head h2 {
      margin: 0;
      color: #f8ddb0;
      font-size: 1.68rem;
      line-height: 1.08;
    }

    .search-shell__head p {
      margin: 0;
      color: var(--muted);
      font-size: 0.93rem;
      max-width: 630px;
    }

    form {
      margin-top: 18px;
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .field label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: #dec8a4;
    }

    .field input {
      width: 100%;
      border: 1px solid rgba(237, 190, 116, 0.32);
      border-radius: 10px;
      padding: 11px 12px;
      font: inherit;
      color: var(--text);
      background: linear-gradient(150deg, rgba(34, 22, 47, 0.9), rgba(28, 19, 39, 0.85));
      box-shadow: inset 0 0 0 1px rgba(248, 211, 147, 0.06);
      transition: border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease;
    }

    .field input::placeholder {
      color: rgba(210, 190, 161, 0.62);
    }

    .field input:focus {
      outline: none;
      border-color: rgba(248, 211, 147, 0.7);
      box-shadow: 0 0 0 4px rgba(227, 181, 103, 0.18), 0 0 26px rgba(227, 181, 103, 0.2);
      transform: translateY(-1px);
    }

    .query { grid-column: span 6; }
    .street { grid-column: span 3; }
    .number { grid-column: span 1; }
    .district { grid-column: span 2; }
    .city { grid-column: span 2; }
    .state { grid-column: span 1; }
    .zip { grid-column: span 1; }
    .complement { grid-column: span 2; }

    .actions {
      grid-column: span 6;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 2px;
    }

    .button {
      border: 0;
      border-radius: 12px;
      padding: 12px 20px;
      font: inherit;
      font-weight: 800;
      letter-spacing: 0.01em;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: #251607;
      background: linear-gradient(135deg, #efca88, #d59b46);
      box-shadow: 0 10px 28px rgba(228, 181, 100, 0.35);
      transition: transform 180ms ease, box-shadow 220ms ease, filter 220ms ease;
    }

    .button::before {
      content: "";
      position: absolute;
      top: -120%;
      left: -45%;
      width: 52%;
      height: 340%;
      background: linear-gradient(90deg, transparent, rgba(255, 246, 227, 0.9), transparent);
      transform: rotate(25deg);
      animation: sweep 4.6s ease-in-out infinite;
      pointer-events: none;
    }
    .button:hover:not(:disabled) {
      transform: translateY(-2px) scale(1.01);
      box-shadow: 0 16px 38px rgba(228, 181, 100, 0.43);
      filter: saturate(1.06);
    }

    .button:focus-visible {
      outline: none;
      box-shadow: 0 0 0 4px rgba(232, 188, 111, 0.3), 0 16px 38px rgba(228, 181, 100, 0.43);
    }

    .button:disabled {
      cursor: not-allowed;
      transform: none;
      opacity: 0.9;
    }

    .button-loader {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid rgba(36, 20, 6, 0.25);
      border-top-color: rgba(36, 20, 6, 0.95);
      display: none;
      animation: spin 760ms linear infinite;
    }

    .button.is-loading .button-loader { display: inline-block; }
    .button.is-loading .button-label { opacity: 0.95; }

    .muted { color: var(--muted); }

    .search-id {
      font-size: 0.9rem;
      min-height: 21px;
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid rgba(228, 181, 100, 0.28);
      background: rgba(228, 181, 100, 0.09);
    }

    .status {
      margin-bottom: 18px;
      padding: 18px;
      display: none;
      background: linear-gradient(170deg, rgba(18, 12, 29, 0.97), rgba(28, 18, 41, 0.9));
    }

    .status.visible {
      display: block;
      animation: revealIn 520ms cubic-bezier(0.2, 0.65, 0.22, 1);
    }

    .status-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .status-head strong {
      color: #f6ddba;
      font-size: 1rem;
    }

    .status-head span {
      color: #eecf9c;
      font-weight: 700;
    }

    .bar {
      height: 11px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(238, 197, 125, 0.14);
      border: 1px solid rgba(238, 197, 125, 0.2);
    }

    .bar > span {
      display: block;
      width: 0;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #efc57f, #29c4a8 70%, #74f6cf);
      box-shadow: 0 0 24px rgba(80, 234, 197, 0.35);
      transition: width 360ms ease;
    }

    .status-line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
      font-size: 0.92rem;
    }

    .error {
      color: var(--danger);
      font-size: 0.84rem;
      font-weight: 700;
    }

    .audit-grid {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
    }

    .store-audit {
      border: 1px solid rgba(234, 192, 126, 0.25);
      border-radius: 10px;
      padding: 8px 10px;
      background: linear-gradient(145deg, rgba(35, 24, 48, 0.86), rgba(27, 18, 38, 0.82));
      box-shadow: inset 0 0 0 1px rgba(248, 207, 137, 0.05);
      display: grid;
      gap: 2px;
      font-size: 0.83rem;
    }

    .store-audit strong {
      color: #f4d7a8;
      text-transform: capitalize;
      font-size: 0.84rem;
    }

    .store-audit.warn {
      border-color: rgba(245, 191, 95, 0.42);
      box-shadow: inset 0 0 0 1px rgba(245, 191, 95, 0.08), 0 0 16px rgba(245, 191, 95, 0.16);
    }

    .store-error { color: var(--warning); font-weight: 600; }

    .results-wrap { margin-top: 18px; }

    .results-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .results-head h2 {
      margin: 0;
      color: #f6ddb4;
      font-size: 1.72rem;
      line-height: 1.08;
    }

    .result-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }

    .card {
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(228, 181, 101, 0.24);
      border-radius: var(--radius-lg);
      padding: 14px;
      background: linear-gradient(166deg, rgba(26, 17, 39, 0.96), rgba(20, 14, 30, 0.93));
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.4);
      transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
    }

    .card::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(circle at top right, rgba(241, 197, 124, 0.16), transparent 42%);
      opacity: 0;
      transition: opacity 220ms ease;
    }

    .result-card {
      opacity: 0;
      transform: translateY(20px) scale(0.985);
      animation: cardIn 680ms cubic-bezier(0.2, 0.65, 0.22, 1) forwards;
    }

    .card:hover {
      transform: translateY(-5px) scale(1.008);
      border-color: rgba(241, 197, 124, 0.45);
      box-shadow: 0 24px 52px rgba(0, 0, 0, 0.46), 0 0 24px rgba(241, 197, 124, 0.2);
    }

    .card:hover::after { opacity: 1; }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .rank {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #ffe7be;
      background: rgba(241, 197, 124, 0.15);
      border: 1px solid rgba(241, 197, 124, 0.42);
    }

    .pill {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.74rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .complete {
      color: var(--success);
      border: 1px solid rgba(44, 197, 167, 0.45);
      background: rgba(44, 197, 167, 0.15);
      box-shadow: 0 0 16px rgba(44, 197, 167, 0.18);
    }

    .incomplete {
      color: #ffd59f;
      border: 1px solid rgba(245, 191, 95, 0.4);
      background: rgba(245, 191, 95, 0.15);
    }

    .card h3 {
      margin: 0 0 8px;
      color: #fff5e4;
      font-size: 1rem;
      line-height: 1.35;
      text-wrap: pretty;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
      font-size: 0.81rem;
      color: var(--muted);
    }

    .store-chip, .match-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 9px;
      border: 1px solid rgba(228, 181, 101, 0.28);
      background: rgba(228, 181, 101, 0.1);
      font-weight: 700;
    }

    .store-chip {
      color: #f4d7a8;
      text-transform: capitalize;
    }

    .total-panel {
      border: 1px solid rgba(234, 192, 126, 0.34);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 10px;
      background: linear-gradient(150deg, rgba(34, 23, 47, 0.92), rgba(26, 18, 38, 0.9));
      box-shadow: inset 0 0 0 1px rgba(240, 200, 134, 0.11);
    }

    .total-label {
      display: block;
      margin-bottom: 4px;
      font-size: 0.73rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #d8ba8a;
      font-weight: 700;
    }

    .price {
      margin: 0;
      font-size: 1.54rem;
      line-height: 1.05;
      font-weight: 800;
      color: #ffe6b8;
      text-shadow: 0 10px 22px rgba(223, 173, 96, 0.25);
    }

    .facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }

    .fact {
      border: 1px solid rgba(232, 190, 127, 0.2);
      border-radius: 10px;
      padding: 8px;
      background: rgba(31, 22, 43, 0.9);
    }

    .fact span {
      display: block;
      margin-bottom: 2px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #d5bb91;
      font-weight: 700;
    }

    .fact strong {
      display: block;
      font-size: 0.82rem;
      color: #f7e8cb;
      line-height: 1.3;
    }

    .coupon-box {
      border: 1px solid rgba(44, 197, 167, 0.35);
      border-radius: 10px;
      padding: 9px 10px;
      margin-bottom: 8px;
      background: linear-gradient(140deg, rgba(19, 41, 36, 0.56), rgba(16, 31, 35, 0.4));
      box-shadow: 0 0 18px rgba(44, 197, 167, 0.16);
      font-size: 0.83rem;
      line-height: 1.35;
    }

    .coupon-head {
      margin-bottom: 4px;
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #98f1d6;
      font-weight: 800;
    }

    .coupon-box strong { color: #cbffeb; }

    .coupon-alt {
      margin-bottom: 8px;
      font-size: 0.78rem;
      line-height: 1.38;
      color: var(--muted);
    }

    .warning {
      margin-top: 4px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid rgba(245, 191, 95, 0.36);
      background: rgba(83, 57, 24, 0.36);
      color: #ffd79d;
      font-size: 0.76rem;
      line-height: 1.35;
    }

    .link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      text-decoration: none;
      font-size: 0.86rem;
      font-weight: 800;
      color: #f6d5a1;
      transition: transform 170ms ease, color 170ms ease;
    }

    .link::after {
      content: "->";
      font-size: 0.9rem;
      opacity: 0.9;
    }

    .link:hover {
      color: #ffe6bc;
      transform: translateX(2px);
    }

    .empty-state {
      margin: 0;
      padding: 16px;
      border-radius: 13px;
      border: 1px dashed rgba(241, 197, 124, 0.4);
      background: rgba(34, 24, 48, 0.68);
      color: #d8c3a4;
      font-size: 0.9rem;
    }

    .skeleton-card {
      min-height: 236px;
      opacity: 0;
      transform: translateY(20px);
      animation: cardIn 620ms cubic-bezier(0.2, 0.65, 0.22, 1) forwards;
    }

    .skeleton-card::after {
      content: "";
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background: linear-gradient(95deg, transparent, rgba(255, 224, 169, 0.22), transparent);
      animation: shimmer 1.4s infinite;
    }

    .s-line {
      height: 10px;
      border-radius: 6px;
      margin-bottom: 9px;
      background: rgba(229, 186, 121, 0.22);
    }

    .s-line.lg { height: 16px; width: 74%; }
    .s-line.md { width: 54%; }
    .s-line.sm { width: 36%; }

    .s-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .s-box {
      border: 1px solid rgba(228, 181, 101, 0.2);
      border-radius: 9px;
      background: rgba(46, 33, 61, 0.55);
      padding: 8px;
    }

    .s-box .s-line {
      height: 8px;
      margin: 0 0 6px;
    }
    @keyframes revealIn {
      from { opacity: 0; transform: translateY(24px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes cardIn {
      from { opacity: 0; transform: translateY(20px) scale(0.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes shimmer {
      100% { transform: translateX(100%); }
    }

    @keyframes sweep {
      0%, 24% { transform: translateX(-130%) rotate(25deg); }
      46%, 100% { transform: translateX(280%) rotate(25deg); }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulseGlow {
      0%, 100% { opacity: 0.45; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.09); }
    }

    @keyframes floatA {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(36px, -18px); }
    }

    @keyframes floatB {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(-40px, 22px); }
    }

    @media (max-width: 1040px) {
      .hero-grid { grid-template-columns: 1fr; }
      .hero-side { max-width: 740px; }
      .facts { grid-template-columns: 1fr; }
    }

    @media (max-width: 920px) {
      .street, .district, .city, .complement { grid-column: span 6; }
      .number, .state, .zip { grid-column: span 2; }
      .hero-badges { grid-template-columns: 1fr; }
      .result-grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    }

    @media (max-width: 720px) {
      .wrap {
        width: min(1200px, calc(100% - 18px));
        padding: 16px 0 28px;
      }
      .hero, .search-shell, .status { padding: 15px; }
      h1 { font-size: clamp(1.7rem, 9vw, 2.4rem); }
      .search-shell__head h2, .results-head h2 { font-size: 1.4rem; }
      .number, .state, .zip { grid-column: span 6; }
      .actions { align-items: stretch; }
      .button {
        width: 100%;
        justify-content: center;
      }
      .search-id {
        width: 100%;
        justify-content: center;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
      .reveal, .result-card, .skeleton-card {
        opacity: 1;
        transform: none;
      }
    }
  </style>
</head>
<body>
  <div class="bg-noise" aria-hidden="true"></div>
  <span class="orb orb-a" aria-hidden="true"></span>
  <span class="orb orb-b" aria-hidden="true"></span>

  <div class="wrap">
    <section class="hero panel reveal step-1">
      <div class="hero-grid">
        <div>
          <span class="eyebrow">Atelier de Ofertas</span>
          <h1>Comparador de Precos com Valor Verificado</h1>
          <p>
            Busque um produto, informe seu endereco e compare ofertas reais por preco
            confirmado nas paginas dos marketplaces.
          </p>

          <div class="hero-badges">
            <div class="hero-badge">
              <strong>Top 10 em segundos</strong>
              <span>Ranking por menor preco verificado.</span>
            </div>
            <div class="hero-badge">
              <strong>Sem valores artificiais</strong>
              <span>Entra no ranking so o que for validado.</span>
            </div>
            <div class="hero-badge">
              <strong>Status em tempo real</strong>
              <span>Acompanhamento por etapa.</span>
            </div>
          </div>
        </div>

        <aside class="hero-side">
          <h3>Curadoria automatica de ofertas</h3>
          <p>Processamento paralelo para resultados com profundidade financeira.</p>
          <ul class="hero-list">
            <li>Coleta de candidatos por marketplace</li>
            <li>Matching e validacao do produto</li>
            <li>Ordenacao por menor preco verificado</li>
          </ul>
        </aside>
      </div>
    </section>

    <section class="search-shell panel reveal step-2">
      <div class="search-shell__head">
        <h2>Iniciar Nova Busca</h2>
        <p>Informe produto e endereco para listar as ofertas reais por menor preco verificado.</p>
      </div>

      <form id="search-form">
        <div class="field query">
          <label for="query">Produto</label>
          <input id="query" name="query" placeholder="Ex.: Iphone 15 128GB" required />
        </div>
        <div class="field street">
          <label for="street">Rua</label>
          <input id="street" name="street" required />
        </div>
        <div class="field number">
          <label for="number">Numero</label>
          <input id="number" name="number" required />
        </div>
        <div class="field district">
          <label for="district">Bairro</label>
          <input id="district" name="district" required />
        </div>
        <div class="field city">
          <label for="city">Cidade</label>
          <input id="city" name="city" required />
        </div>
        <div class="field state">
          <label for="state">UF</label>
          <input id="state" name="state" maxlength="2" required />
        </div>
        <div class="field zip">
          <label for="zipCode">CEP</label>
          <input id="zipCode" name="zipCode" required />
        </div>
        <div class="field complement">
          <label for="complement">Complemento (opcional)</label>
          <input id="complement" name="complement" />
        </div>

        <div class="actions">
          <button id="search-submit" class="button" type="submit">
            <span class="button-label">Pesquisar agora</span>
            <span class="button-loader" aria-hidden="true"></span>
          </button>
          <span class="muted search-id" id="search-id"></span>
        </div>
      </form>
    </section>

    <section class="status panel reveal step-3" id="status-box">
      <div class="status-head">
        <strong id="status-stage">Aguardando...</strong>
        <span id="status-progress">0%</span>
      </div>
      <div class="bar"><span id="status-progress-bar"></span></div>
      <div class="status-line">
        <span class="muted" id="status-summary"></span>
        <span class="error" id="status-error"></span>
      </div>
      <div class="audit-grid" id="audit-stores"></div>
    </section>

    <section class="results-wrap reveal step-4">
      <div class="results-head">
        <h2>Top 10 Ofertas Verificadas</h2>
        <span class="muted" id="results-caption">Resultados ordenados por menor preco verificado.</span>
      </div>
      <div class="result-grid" id="results"></div>
    </section>
  </div>

  <script>
    const form = document.getElementById("search-form");
    const statusBox = document.getElementById("status-box");
    const statusStage = document.getElementById("status-stage");
    const statusProgress = document.getElementById("status-progress");
    const statusProgressBar = document.getElementById("status-progress-bar");
    const statusSummary = document.getElementById("status-summary");
    const statusError = document.getElementById("status-error");
    const auditStores = document.getElementById("audit-stores");
    const resultsEl = document.getElementById("results");
    const resultsCaption = document.getElementById("results-caption");
    const searchIdEl = document.getElementById("search-id");
    const submitButton = document.getElementById("search-submit");
    const buttonLabel = submitButton.querySelector(".button-label");

    let pollTimer = null;

    const fmtCurrency = (value) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
    };

    const escapeHtml = (raw) => String(raw)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

    const clampProgress = (value) => {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) return 0;
      if (numeric < 0) return 0;
      if (numeric > 100) return 100;
      return Math.round(numeric);
    };

    const setButtonLoading = (isLoading) => {
      submitButton.disabled = isLoading;
      submitButton.classList.toggle("is-loading", isLoading);
      buttonLabel.textContent = isLoading ? "Buscando ofertas..." : "Pesquisar agora";
    };

    const renderSkeleton = (count) => {
      const size = Number(count) > 0 ? Number(count) : 6;
      const skeletonCards = Array.from({ length: size }).map((_, index) => {
        return "<article class='card skeleton-card' style='animation-delay:" + (index * 85) + "ms'>" +
          "<div class='s-line sm'></div>" +
          "<div class='s-line lg'></div>" +
          "<div class='s-line md'></div>" +
          "<div class='s-grid'>" +
            "<div class='s-box'><div class='s-line'></div><div class='s-line sm'></div></div>" +
            "<div class='s-box'><div class='s-line'></div><div class='s-line sm'></div></div>" +
            "<div class='s-box'><div class='s-line'></div><div class='s-line sm'></div></div>" +
          "</div>" +
        "</article>";
      }).join("");

      resultsEl.innerHTML = skeletonCards;
      resultsCaption.textContent = "Consultando marketplaces e validando preco de cada oferta...";
    };

    const renderStoreAudit = (snapshot) => {
      const stores = Array.isArray(snapshot?.audit?.stores) ? snapshot.audit.stores : [];
      if (!stores.length) {
        auditStores.innerHTML = "";
        return;
      }

      auditStores.innerHTML = stores.map((entry) => {
        const storeName = escapeHtml(entry.store || "loja");
        const fetched = Number(entry.fetched || 0);
        const errors = Array.isArray(entry.errors) ? entry.errors : [];

        const errorHtml = errors.length > 0
          ? "<span class='store-error'>" + escapeHtml(errors.join(", ")) + "</span>"
          : "<span class='muted'>coleta sem erros tecnicos</span>";
        const warnClass = errors.length > 0 ? " warn" : "";

        return "<div class='store-audit" + warnClass + "'>" +
          "<strong>" + storeName + "</strong>" +
          "<span>" + fetched + " itens validos</span>" +
          errorHtml +
          "</div>";
      }).join("");
    };

    const renderResults = (results) => {
      if (!Array.isArray(results) || results.length === 0) {
        resultsEl.innerHTML = "<p class='empty-state'>Nenhuma oferta validada encontrada para este termo no momento.</p>";
        resultsCaption.textContent = "Sem ofertas verificadas agora.";
        return;
      }

      resultsCaption.textContent = String(results.length) + " ofertas ordenadas por menor preco verificado.";

      resultsEl.innerHTML = results.map((item, index) => {
        const warnings = (item.warnings || [])
          .map((warning) => "<div class='warning'>" + escapeHtml(warning) + "</div>")
          .join("");

        const verifiedPriceLabel = fmtCurrency(item.verifiedPrice);
        const href = escapeHtml(item.affiliateUrl || item.productUrl);
        const rank = item.rank || index + 1;
        const delay = index * 85;
        const safeTitle = escapeHtml(item.title || "Produto sem titulo");

        return "<article class='card result-card' style='animation-delay:" + delay + "ms'>" +
          "<div class='card-top'>" +
            "<span class='rank'>#" + rank + "</span>" +
            "<span class='pill complete'>Preco validado</span>" +
          "</div>" +
          "<h3>" + safeTitle + "</h3>" +
          "<div class='meta-row'>" +
            "<span class='store-chip'>" + escapeHtml(item.store) + "</span>" +
            "<span class='match-chip'>match: " + escapeHtml(item.matchType) + "</span>" +
          "</div>" +
          "<div class='total-panel'>" +
            "<span class='total-label'>Preco verificado</span>" +
            "<p class='price'>" + verifiedPriceLabel + "</p>" +
          "</div>" +
          warnings +
          "<a class='link' href='" + href + "' target='_blank' rel='noreferrer'>Ir para oferta</a>" +
          "</article>";
      }).join("");
    };

    const updateStatus = (snapshot) => {
      statusBox.classList.add("visible");
      const progress = clampProgress(snapshot.progressPercent);
      statusStage.textContent = "Status: " + snapshot.status + " • Etapa: " + snapshot.stage;
      statusProgress.textContent = String(progress) + "%";
      statusProgressBar.style.width = String(progress) + "%";

      const audit = snapshot.audit || {};
      statusSummary.textContent =
        "coletados: " + (audit.totalCandidates || 0) +
        " • match: " + (audit.matchedCandidates || 0) +
        " • rankeados: " + (audit.enrichedCandidates || 0);
      statusError.textContent = snapshot.errorMessage || "";
      renderStoreAudit(snapshot);
      renderResults(snapshot.results || []);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const pollSearch = async (searchId) => {
      try {
        const response = await fetch("/api/searches/" + encodeURIComponent(searchId));
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Erro ao consultar busca");
        }

        updateStatus(payload);

        if (payload.status === "completed" || payload.status === "failed") {
          stopPolling();
          setButtonLoading(false);
        }
      } catch (error) {
        stopPolling();
        setButtonLoading(false);
        statusError.textContent = error.message || "Erro inesperado";
      }
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      stopPolling();
      setButtonLoading(true);
      statusError.textContent = "";
      renderSkeleton(8);
      statusBox.classList.add("visible");
      statusStage.textContent = "Status: running • Etapa: preparando";
      statusProgress.textContent = "0%";
      statusProgressBar.style.width = "0%";
      statusSummary.textContent = "Iniciando busca...";
      auditStores.innerHTML = "";
      searchIdEl.textContent = "";

      const formData = new FormData(form);
      const body = {
        query: String(formData.get("query") || "").trim(),
        address: {
          street: String(formData.get("street") || "").trim(),
          number: String(formData.get("number") || "").trim(),
          district: String(formData.get("district") || "").trim(),
          city: String(formData.get("city") || "").trim(),
          state: String(formData.get("state") || "").trim().toUpperCase(),
          zipCode: String(formData.get("zipCode") || "").trim(),
          complement: String(formData.get("complement") || "").trim() || null
        }
      };

      try {
        const response = await fetch("/api/searches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Nao foi possivel iniciar a busca.");
        }

        const searchId = payload.searchId;
        searchIdEl.textContent = "Busca: " + searchId;

        await pollSearch(searchId);
        pollTimer = setInterval(() => pollSearch(searchId), 1500);
      } catch (error) {
        setButtonLoading(false);
        statusBox.classList.add("visible");
        statusError.textContent = error.message || "Erro inesperado";
        renderResults([]);
      }
    });
  </script>
</body>
</html>`;
}

