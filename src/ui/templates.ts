import { DealRow } from "../db/repository";
import { SenderStatus, StatsSummary } from "../shared/types";
import { formatCurrency } from "../shared/utils";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function renderLoginPage(error?: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Login - Robo de Anuncios</title>
  <style>
    body { font-family: Segoe UI, sans-serif; background: #f5f7fb; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .box { width: 340px; background:#fff; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.08); padding:24px; }
    h1 { margin:0 0 16px; font-size:20px; }
    label { display:block; margin:10px 0 4px; font-size:14px; }
    input { width:100%; padding:10px; border:1px solid #d1d7e0; border-radius:8px; }
    button { margin-top:16px; width:100%; border:0; background:#0b57d0; color:#fff; padding:10px; border-radius:8px; font-weight:600; cursor:pointer; }
    .error { background:#fdeaea; color:#a01818; border:1px solid #e3a9a9; border-radius:8px; padding:8px; margin-bottom:10px; font-size:13px; }
  </style>
</head>
<body>
  <form class="box" method="post" action="/login">
    <h1>Robo de Anuncios</h1>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <label>Usuario</label>
    <input name="username" autocomplete="username" required />
    <label>Senha</label>
    <input type="password" name="password" autocomplete="current-password" required />
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`;
}

interface PanelData {
  pendingDeals: DealRow[];
  history: Array<{
    id: number;
    deal_id: string;
    group_id: string;
    status: string;
    attempts: number;
    created_at: string;
    sent_at: string | null;
    title: string;
    store: string;
    is_test: number;
  }>;
  stats: StatsSummary;
  alerts: Array<{ id: number; level: string; message: string; created_at: string }>;
  senderStatus: SenderStatus;
  sandboxGroup: string;
  productionGroups: string[];
  defaultHookText: string;
  defaultCtaText: string;
}

function renderPendingDeals(data: PanelData): string {
  if (data.pendingDeals.length === 0) {
    return `<p>Nenhuma oferta pendente no momento.</p>`;
  }

  return data.pendingDeals
    .map((deal) => {
      const preview = `${data.defaultHookText} ${deal.title} - ${
        deal.price_reference && deal.price_reference > deal.price_current
          ? `de ${formatCurrency(deal.price_reference)} por ${formatCurrency(deal.price_current)}`
          : `por ${formatCurrency(deal.price_current)}`
      }`;

      return `
      <article class="card">
        <div class="row"><strong>${escapeHtml(deal.title)}</strong></div>
        <div class="row muted">Loja: ${escapeHtml(deal.store)} | Score: ${deal.score.toFixed(2)} | Desconto: ${deal.discount_percent.toFixed(2)}%</div>
        <div class="row">Preco atual: ${formatCurrency(deal.price_current)} ${
          deal.price_reference && deal.price_reference > 0
            ? `| Referencia: ${formatCurrency(deal.price_reference)}`
            : ""
        }</div>
        <div class="row"><a href="${escapeHtml(deal.product_url)}" target="_blank" rel="noreferrer">Link original</a></div>
        <div class="preview">Preview: ${escapeHtml(preview)}</div>
        <textarea id="msg-${deal.id}" placeholder="Mensagem customizada (opcional)"></textarea>
        <div class="controls">
          <select id="mode-${deal.id}">
            <option value="sandbox">Enviar sandbox (${escapeHtml(data.sandboxGroup)})</option>
            <option value="production">Enviar producao (${escapeHtml(data.productionGroups.join(", ") || "sem grupos")})</option>
          </select>
          <button onclick="approveDeal('${deal.id}')">Aprovar</button>
          <button class="danger" onclick="rejectDeal('${deal.id}')">Rejeitar</button>
        </div>
      </article>`;
    })
    .join("\n");
}

function renderHistory(data: PanelData): string {
  if (data.history.length === 0) {
    return `<p>Sem historico de envios.</p>`;
  }

  return `
<table>
  <thead>
    <tr>
      <th>ID</th><th>Oferta</th><th>Loja</th><th>Grupo</th><th>Status</th><th>Tentativas</th><th>Criado em</th><th>Enviado em</th>
    </tr>
  </thead>
  <tbody>
    ${data.history
      .map(
        (row) => `<tr>
      <td>${row.id}</td>
      <td>${escapeHtml(row.title)} ${row.is_test ? "<span class='tag'>TESTE</span>" : ""}</td>
      <td>${escapeHtml(row.store)}</td>
      <td>${escapeHtml(row.group_id)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${row.attempts}</td>
      <td>${escapeHtml(row.created_at)}</td>
      <td>${row.sent_at ? escapeHtml(row.sent_at) : "-"}</td>
    </tr>`,
      )
      .join("\n")}
  </tbody>
</table>`;
}

function renderAlerts(data: PanelData): string {
  if (data.alerts.length === 0) return `<p>Sem alertas ativos.</p>`;

  return data.alerts
    .map(
      (alert) => `<div class="alert ${escapeHtml(alert.level)}">
        <div><strong>${escapeHtml(alert.level.toUpperCase())}</strong> - ${escapeHtml(alert.message)}</div>
        <div>${escapeHtml(alert.created_at)}</div>
      </div>`,
    )
    .join("\n");
}

function renderStats(data: PanelData): string {
  const cards = [
    ["Coletadas", data.stats.totalCollected],
    ["Pendentes", data.stats.pending],
    ["Aprovadas", data.stats.approved],
    ["Enviadas", data.stats.sent],
    ["Falhas", data.stats.failed],
    ["Cliques", data.stats.clicks],
  ];

  const ctrRows = data.stats.ctrByStore
    .map((item) => `<tr><td>${escapeHtml(item.store)}</td><td>${item.sent}</td><td>${item.clicks}</td><td>${item.ctrPercent}%</td></tr>`)
    .join("\n");

  const topDealsRows = data.stats.topDeals
    .map((item) => `<tr><td>${escapeHtml(item.store)}</td><td>${escapeHtml(item.title)}</td><td>${item.clicks}</td></tr>`)
    .join("\n");

  return `
  <div class="stats-grid">
    ${cards.map(([label, value]) => `<div class="stat"><div class="k">${label}</div><div class="v">${value}</div></div>`).join("\n")}
  </div>
  <h3>CTR por loja</h3>
  <table>
    <thead><tr><th>Loja</th><th>Envios</th><th>Cliques</th><th>CTR</th></tr></thead>
    <tbody>${ctrRows || "<tr><td colspan='4'>Sem dados</td></tr>"}</tbody>
  </table>
  <h3>Top ofertas</h3>
  <table>
    <thead><tr><th>Loja</th><th>Titulo</th><th>Cliques</th></tr></thead>
    <tbody>${topDealsRows || "<tr><td colspan='3'>Sem dados</td></tr>"}</tbody>
  </table>`;
}

export function renderPanelPage(data: PanelData): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Painel - Robo de Anuncios</title>
  <style>
    body{font-family:Segoe UI,sans-serif;background:#f4f6fa;margin:0;color:#1f2430;}
    header{background:#0e1b3a;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}
    main{padding:20px;max-width:1200px;margin:0 auto}
    section{background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 8px 25px rgba(0,0,0,.05)}
    h1,h2,h3{margin:0 0 12px}
    p{margin:6px 0}
    .muted{color:#5c6577}
    .card{border:1px solid #e4e8f0;border-radius:10px;padding:12px;margin-bottom:12px;background:#fcfdff}
    .row{margin-bottom:8px}
    textarea{width:100%;min-height:70px;border:1px solid #cfd8e6;border-radius:8px;padding:10px;resize:vertical}
    .controls{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    button{border:0;background:#0b57d0;color:#fff;padding:9px 12px;border-radius:8px;cursor:pointer}
    button.danger{background:#b42318}
    button.ghost{background:#253858}
    select{padding:8px;border:1px solid #cfd8e6;border-radius:8px;background:#fff}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid #eceff5;padding:8px;text-align:left;font-size:13px}
    .preview{background:#f1f5ff;border-left:3px solid #0b57d0;padding:8px;border-radius:6px;margin-bottom:8px;font-size:13px}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px}
    .stat{background:#f8faff;border:1px solid #dfe5f0;border-radius:10px;padding:10px}
    .k{font-size:12px;color:#57607a}
    .v{font-size:24px;font-weight:700}
    .tag{display:inline-block;background:#fff1cc;color:#7a5a00;padding:2px 6px;border-radius:999px;font-size:11px}
    .alert{border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid}
    .alert.info{background:#edf5ff;border-color:#9dc4ff}
    .alert.warning{background:#fff6e8;border-color:#f1c582}
    .alert.error{background:#fdecec;border-color:#ed9c9c}
    .bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Painel de Ofertas</h1>
      <p class="muted">Sender: ${escapeHtml(data.senderStatus.mode)} | ${escapeHtml(data.senderStatus.detail)} | Atualizado: ${escapeHtml(data.senderStatus.lastUpdatedAt)}</p>
    </div>
    <form action="/logout" method="post"><button class="ghost" type="submit">Sair</button></form>
  </header>
  <main>
    <section>
      <h2>Atalhos</h2>
      <div class="bar">
        <button onclick="collectNow()">Coletar agora</button>
        <button onclick="testBroadcast()">Enviar teste sandbox</button>
      </div>
    </section>
    <section>
      <h2>Metricas</h2>
      ${renderStats(data)}
    </section>
    <section>
      <h2>Alertas</h2>
      ${renderAlerts(data)}
    </section>
    <section>
      <h2>Fila de ofertas pendentes</h2>
      ${renderPendingDeals(data)}
    </section>
    <section>
      <h2>Historico de envios</h2>
      ${renderHistory(data)}
    </section>
  </main>
  <script>
    async function approveDeal(dealId) {
      const customMessage = document.getElementById("msg-" + dealId).value;
      const mode = document.getElementById("mode-" + dealId).value;
      const payload = { customMessage, production: mode === "production" };

      const response = await fetch("/deals/" + dealId + "/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Erro ao aprovar");
        return;
      }
      location.reload();
    }

    async function rejectDeal(dealId) {
      const reason = prompt("Motivo da rejeicao (opcional):", "");
      const response = await fetch("/deals/" + dealId + "/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Erro ao rejeitar");
        return;
      }
      location.reload();
    }

    async function testBroadcast() {
      const message = prompt("Mensagem de teste (vazio para padrao):", "");
      const response = await fetch("/broadcast/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Erro no envio de teste");
        return;
      }
      alert("Teste enviado para sandbox.");
      location.reload();
    }

    async function collectNow() {
      const response = await fetch("/collector/run", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Erro na coleta");
        return;
      }
      alert("Coleta disparada.");
      location.reload();
    }
  </script>
</body>
</html>`;
}

