import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DealNormalized, StatsSummary } from "../shared/types";
import { nowIso } from "../shared/utils";

export interface DealRow {
  id: string;
  store: string;
  store_item_id: string;
  title: string;
  category: string | null;
  price_current: number;
  price_reference: number | null;
  product_url: string;
  affiliate_url: string;
  discount_percent: number;
  score: number;
  dedup_hash: string;
  status: string;
  custom_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRow {
  id: number;
  deal_id: string;
  group_id: string;
  message_text: string;
  status: string;
  attempts: number;
  last_error: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  is_test: number;
}

export class AppRepository {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        store TEXT NOT NULL,
        store_item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT,
        price_current REAL NOT NULL,
        price_reference REAL,
        product_url TEXT NOT NULL,
        affiliate_url TEXT NOT NULL,
        discount_percent REAL NOT NULL,
        score REAL NOT NULL,
        dedup_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        custom_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store TEXT NOT NULL,
        store_item_id TEXT NOT NULL,
        price REAL NOT NULL,
        captured_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS broadcasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        message_text TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        scheduled_at TEXT NOT NULL,
        sent_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_test INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(deal_id) REFERENCES deals(id)
      );

      CREATE TABLE IF NOT EXISTS clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        clicked_at TEXT NOT NULL,
        user_agent TEXT,
        ip_hash TEXT,
        FOREIGN KEY(deal_id) REFERENCES deals(id)
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS deal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        meta_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(deal_id) REFERENCES deals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
      CREATE INDEX IF NOT EXISTS idx_price_history_item ON price_history(store, store_item_id, captured_at);
      CREATE INDEX IF NOT EXISTS idx_broadcasts_status_sched ON broadcasts(status, scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_broadcasts_group_sent ON broadcasts(group_id, sent_at);
      CREATE INDEX IF NOT EXISTS idx_clicks_deal ON clicks(deal_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved, created_at);
    `);
  }

  close(): void {
    this.db.close();
  }

  insertDeal(deal: DealNormalized): boolean {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO deals (
        id, store, store_item_id, title, category, price_current, price_reference,
        product_url, affiliate_url, discount_percent, score, dedup_hash, status,
        custom_message, created_at, updated_at
      ) VALUES (
        @id, @store, @store_item_id, @title, @category, @price_current, @price_reference,
        @product_url, @affiliate_url, @discount_percent, @score, @dedup_hash, @status,
        @custom_message, @created_at, @updated_at
      )
    `);

    const result = stmt.run({
      id: deal.id,
      store: deal.store,
      store_item_id: deal.storeItemId,
      title: deal.title,
      category: deal.category ?? null,
      price_current: deal.currentPrice,
      price_reference: deal.referencePrice ?? null,
      product_url: deal.productUrl,
      affiliate_url: deal.affiliateUrl,
      discount_percent: deal.discountPercent,
      score: deal.score,
      dedup_hash: deal.dedupHash,
      status: deal.status,
      custom_message: null,
      created_at: deal.createdAt,
      updated_at: deal.updatedAt,
    });

    return result.changes > 0;
  }

  upsertPriceHistory(store: string, storeItemId: string, price: number, capturedAt: string): void {
    const stmt = this.db.prepare(
      `INSERT INTO price_history (store, store_item_id, price, captured_at) VALUES (?, ?, ?, ?)`,
    );
    stmt.run(store, storeItemId, price, capturedAt);
  }

  getHistoricalAverage(store: string, storeItemId: string, limit = 20): number | null {
    const row = this.db
      .prepare(
        `SELECT AVG(price) as avg_price
         FROM (
           SELECT price
           FROM price_history
           WHERE store = ? AND store_item_id = ?
           ORDER BY captured_at DESC
           LIMIT ?
         )`,
      )
      .get(store, storeItemId, limit) as { avg_price: number | null } | undefined;

    return row?.avg_price ?? null;
  }

  listPendingDeals(limit = 200): DealRow[] {
    return this.db
      .prepare(
        `SELECT * FROM deals WHERE status = 'pending' ORDER BY score DESC, created_at DESC LIMIT ?`,
      )
      .all(limit) as DealRow[];
  }

  listRecentDeals(limit = 150): DealRow[] {
    return this.db
      .prepare(`SELECT * FROM deals ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as DealRow[];
  }

  getDealById(dealId: string): DealRow | null {
    const row = this.db.prepare(`SELECT * FROM deals WHERE id = ?`).get(dealId) as DealRow | undefined;
    return row ?? null;
  }

  updateDealStatus(dealId: string, status: string, customMessage?: string | null): void {
    this.db
      .prepare(
        `UPDATE deals
         SET status = ?, custom_message = COALESCE(?, custom_message), updated_at = ?
         WHERE id = ?`,
      )
      .run(status, customMessage ?? null, nowIso(), dealId);
  }

  rejectDeal(dealId: string, reason?: string): void {
    const timestamp = nowIso();
    const tx = this.db.transaction(() => {
      this.db
        .prepare(`UPDATE deals SET status = 'rejected', updated_at = ? WHERE id = ?`)
        .run(timestamp, dealId);
      this.db
        .prepare(
          `INSERT INTO deal_events (deal_id, event_type, meta_json, created_at) VALUES (?, 'rejected', ?, ?)`,
        )
        .run(dealId, reason ? JSON.stringify({ reason }) : null, timestamp);
    });
    tx();
  }

  queueBroadcasts(
    dealId: string,
    items: Array<{ groupId: string; messageText: string; isTest: boolean }>,
  ): void {
    const timestamp = nowIso();
    const insertStmt = this.db.prepare(
      `INSERT INTO broadcasts (
        deal_id, group_id, message_text, status, attempts, last_error,
        scheduled_at, sent_at, created_at, updated_at, is_test
      ) VALUES (?, ?, ?, 'queued', 0, NULL, ?, NULL, ?, ?, ?)`,
    );

    const tx = this.db.transaction(() => {
      for (const item of items) {
        insertStmt.run(
          dealId,
          item.groupId,
          item.messageText,
          timestamp,
          timestamp,
          timestamp,
          item.isTest ? 1 : 0,
        );
      }
      this.db
        .prepare(`UPDATE deals SET status = 'approved', updated_at = ? WHERE id = ?`)
        .run(timestamp, dealId);
      this.db
        .prepare(
          `INSERT INTO deal_events (deal_id, event_type, meta_json, created_at)
           VALUES (?, 'queued', ?, ?)`,
        )
        .run(dealId, JSON.stringify({ total: items.length }), timestamp);
    });

    tx();
  }

  createBroadcast(
    dealId: string,
    groupId: string,
    messageText: string,
    status: "sent" | "failed",
    error?: string,
    isTest = true,
  ): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO broadcasts (
          deal_id, group_id, message_text, status, attempts, last_error,
          scheduled_at, sent_at, created_at, updated_at, is_test
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dealId,
        groupId,
        messageText,
        status,
        error ?? null,
        timestamp,
        status === "sent" ? timestamp : null,
        timestamp,
        timestamp,
        isTest ? 1 : 0,
      );
  }

  listDueBroadcasts(now: string, limit = 20): BroadcastRow[] {
    return this.db
      .prepare(
        `SELECT *
         FROM broadcasts
         WHERE status IN ('queued', 'retrying') AND scheduled_at <= ?
         ORDER BY scheduled_at ASC, id ASC
         LIMIT ?`,
      )
      .all(now, limit) as BroadcastRow[];
  }

  markBroadcastSent(broadcastId: number): void {
    const timestamp = nowIso();
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE broadcasts
           SET status = 'sent', sent_at = ?, updated_at = ?, last_error = NULL
           WHERE id = ?`,
        )
        .run(timestamp, timestamp, broadcastId);

      const row = this.db
        .prepare(`SELECT deal_id FROM broadcasts WHERE id = ?`)
        .get(broadcastId) as { deal_id: string };

      this.refreshDealStatus(row.deal_id);
    });

    tx();
  }

  markBroadcastRetry(broadcastId: number, error: string, nextScheduledAt: string): void {
    this.db
      .prepare(
        `UPDATE broadcasts
         SET status = 'retrying', attempts = attempts + 1, last_error = ?, scheduled_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(error, nextScheduledAt, nowIso(), broadcastId);
  }

  markBroadcastFailed(broadcastId: number, error: string): void {
    const timestamp = nowIso();
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE broadcasts
           SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(error, timestamp, broadcastId);

      const row = this.db
        .prepare(`SELECT deal_id FROM broadcasts WHERE id = ?`)
        .get(broadcastId) as { deal_id: string };

      this.refreshDealStatus(row.deal_id);
    });

    tx();
  }

  private refreshDealStatus(dealId: string): void {
    const row = this.db
      .prepare(
        `SELECT
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
            SUM(CASE WHEN status IN ('queued', 'retrying') THEN 1 ELSE 0 END) as queue_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
         FROM broadcasts
         WHERE deal_id = ?`,
      )
      .get(dealId) as { sent_count: number; queue_count: number; failed_count: number };

    let status = "approved";
    if (row.queue_count === 0 && row.sent_count > 0) status = "sent";
    if (row.queue_count === 0 && row.sent_count === 0 && row.failed_count > 0) status = "failed";

    this.db
      .prepare(`UPDATE deals SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, nowIso(), dealId);
  }

  getGroupLastSentAt(groupId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT sent_at FROM broadcasts WHERE group_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1`,
      )
      .get(groupId) as { sent_at: string } | undefined;
    return row?.sent_at ?? null;
  }

  getGroupSentCountToday(groupId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as total
         FROM broadcasts
         WHERE group_id = ?
           AND status = 'sent'
           AND date(sent_at, 'localtime') = date('now', 'localtime')`,
      )
      .get(groupId) as { total: number };
    return row.total;
  }

  listBroadcastHistory(limit = 200): Array<BroadcastRow & { title: string; store: string }> {
    return this.db
      .prepare(
        `SELECT b.*, d.title, d.store
         FROM broadcasts b
         INNER JOIN deals d ON d.id = b.deal_id
         ORDER BY b.created_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<BroadcastRow & { title: string; store: string }>;
  }

  hasSandboxSent(dealId: string, sandboxGroupId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as total
         FROM broadcasts
         WHERE deal_id = ?
           AND group_id = ?
           AND status = 'sent'`,
      )
      .get(dealId, sandboxGroupId) as { total: number };
    return row.total > 0;
  }

  recordClick(dealId: string, groupId: string, userAgent: string | undefined, ipHash: string): void {
    this.db
      .prepare(
        `INSERT INTO clicks (deal_id, group_id, clicked_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(dealId, groupId, nowIso(), userAgent ?? null, ipHash);
  }

  getStatsSummary(): StatsSummary {
    const counts = this.db
      .prepare(
        `SELECT
           COUNT(*) as total_collected,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
           SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM deals`,
      )
      .get() as {
      total_collected: number;
      pending: number;
      approved: number;
      sent: number;
      failed: number;
    };

    const clicksRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM clicks`)
      .get() as { total: number };

    const sentByStore = this.db
      .prepare(
        `SELECT d.store as store, COUNT(*) as sent
         FROM broadcasts b
         INNER JOIN deals d ON d.id = b.deal_id
         WHERE b.status = 'sent' AND b.is_test = 0
         GROUP BY d.store`,
      )
      .all() as Array<{ store: string; sent: number }>;

    const clicksByStore = this.db
      .prepare(
        `SELECT d.store as store, COUNT(*) as clicks
         FROM clicks c
         INNER JOIN deals d ON d.id = c.deal_id
         GROUP BY d.store`,
      )
      .all() as Array<{ store: string; clicks: number }>;

    const clicksMap = new Map(clicksByStore.map((item) => [item.store, item.clicks]));
    const ctrByStore = sentByStore.map((item) => {
      const clicks = clicksMap.get(item.store) ?? 0;
      const ctrPercent = item.sent > 0 ? Number(((clicks / item.sent) * 100).toFixed(2)) : 0;
      return {
        store: item.store,
        sent: item.sent,
        clicks,
        ctrPercent,
      };
    });

    const topDeals = this.db
      .prepare(
        `SELECT c.deal_id as dealId, d.title as title, d.store as store, COUNT(*) as clicks
         FROM clicks c
         INNER JOIN deals d ON d.id = c.deal_id
         GROUP BY c.deal_id, d.title, d.store
         ORDER BY clicks DESC
         LIMIT 10`,
      )
      .all() as Array<{ dealId: string; title: string; store: string; clicks: number }>;

    const clicksByHour = this.db
      .prepare(
        `SELECT CAST(strftime('%H', clicked_at) AS INTEGER) as hour, COUNT(*) as clicks
         FROM clicks
         GROUP BY hour
         ORDER BY hour`,
      )
      .all() as Array<{ hour: number; clicks: number }>;

    return {
      totalCollected: counts.total_collected ?? 0,
      pending: counts.pending ?? 0,
      approved: counts.approved ?? 0,
      sent: counts.sent ?? 0,
      failed: counts.failed ?? 0,
      clicks: clicksRow.total ?? 0,
      ctrByStore,
      topDeals,
      clicksByHour,
    };
  }

  addAlert(type: string, message: string, level: "info" | "warning" | "error" = "warning"): void {
    this.db
      .prepare(
        `INSERT INTO alerts (type, level, message, created_at, resolved, resolved_at)
         VALUES (?, ?, ?, ?, 0, NULL)`,
      )
      .run(type, level, message, nowIso());
  }

  listOpenAlerts(limit = 50): Array<{
    id: number;
    type: string;
    level: string;
    message: string;
    created_at: string;
  }> {
    return this.db
      .prepare(
        `SELECT id, type, level, message, created_at
         FROM alerts
         WHERE resolved = 0
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{ id: number; type: string; level: string; message: string; created_at: string }>;
  }

  resolveAlert(alertId: number): void {
    this.db
      .prepare(`UPDATE alerts SET resolved = 1, resolved_at = ? WHERE id = ?`)
      .run(nowIso(), alertId);
  }
}
