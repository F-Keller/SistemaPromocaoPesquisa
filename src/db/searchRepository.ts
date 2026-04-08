import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  RankedSearchResult,
  SearchAudit,
  SearchProgressUpdate,
  SearchSnapshot,
  SearchStage,
  SearchStatus,
} from "../search/types";
import { nowIso } from "../shared/utils";

interface SearchRow {
  id: string;
  query: string;
  status: SearchStatus;
  stage: SearchStage;
  progress_percent: number;
  audit_json: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  expires_at: string;
}

interface SearchResultRow {
  search_id: string;
  rank_position: number;
  store: string;
  title: string;
  base_price: number;
  total_final: number | null;
  is_cost_complete: number;
  payload_json: string;
  created_at: string;
}

interface SearchCacheRow {
  cache_key: string;
  payload_json: string;
  created_at: string;
  expires_at: string;
}

export interface CachedSearchPayload {
  audit: SearchAudit;
  results: RankedSearchResult[];
  createdAt: string;
}

const DEFAULT_AUDIT: SearchAudit = {
  totalCandidates: 0,
  matchedCandidates: 0,
  enrichedCandidates: 0,
  completeCandidates: 0,
  incompleteCandidates: 0,
  stores: [],
};

export class SearchRepository {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        progress_percent INTEGER NOT NULL,
        audit_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_id TEXT NOT NULL,
        rank_position INTEGER NOT NULL,
        store TEXT NOT NULL,
        title TEXT NOT NULL,
        base_price REAL NOT NULL,
        total_final REAL,
        is_cost_complete INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(search_id) REFERENCES searches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS search_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_searches_status_updated ON searches(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_searches_expires ON searches(expires_at);
      CREATE INDEX IF NOT EXISTS idx_search_results_search_rank ON search_results(search_id, rank_position);
      CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);
    `);
  }

  close(): void {
    this.db.close();
  }

  createSearch(query: string, ttlMinutes: number): string {
    const id = randomUUID();
    const now = nowIso();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO searches (
          id, query, status, stage, progress_percent, audit_json, error_message,
          created_at, started_at, completed_at, updated_at, expires_at
        ) VALUES (?, ?, 'queued', 'queued', 0, ?, NULL, ?, NULL, NULL, ?, ?)`
      )
      .run(id, query, JSON.stringify(DEFAULT_AUDIT), now, now, expiresAt);

    return id;
  }

  updateSearch(searchId: string, update: SearchProgressUpdate): void {
    const current = this.db
      .prepare(`SELECT * FROM searches WHERE id = ?`)
      .get(searchId) as SearchRow | undefined;

    if (!current) {
      throw new Error(`Search ${searchId} not found.`);
    }

    const nextStatus = update.status ?? current.status;
    const nextStage = update.stage ?? current.stage;
    const nextProgress =
      update.progressPercent === undefined ? current.progress_percent : update.progressPercent;
    const nextAudit = update.audit
      ? JSON.stringify(update.audit)
      : current.audit_json ?? JSON.stringify(DEFAULT_AUDIT);

    this.db
      .prepare(
        `UPDATE searches
         SET status = ?,
             stage = ?,
             progress_percent = ?,
             audit_json = ?,
             error_message = ?,
             started_at = ?,
             completed_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextStatus,
        nextStage,
        nextProgress,
        nextAudit,
        update.errorMessage === undefined ? current.error_message : update.errorMessage,
        update.startedAt === undefined ? current.started_at : update.startedAt,
        update.completedAt === undefined ? current.completed_at : update.completedAt,
        nowIso(),
        searchId,
      );
  }

  replaceSearchResults(searchId: string, results: RankedSearchResult[]): void {
    const now = nowIso();
    const deleteStmt = this.db.prepare(`DELETE FROM search_results WHERE search_id = ?`);
    const insertStmt = this.db.prepare(
      `INSERT INTO search_results (
        search_id, rank_position, store, title, base_price, total_final, is_cost_complete, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.transaction(() => {
      deleteStmt.run(searchId);
      for (const result of results) {
        insertStmt.run(
          searchId,
          result.rank,
          result.store,
          result.title,
          result.basePrice,
          result.totalFinal,
          result.isCostComplete ? 1 : 0,
          JSON.stringify(result),
          now,
        );
      }
    });

    tx();
  }

  getSearchSnapshot(searchId: string): SearchSnapshot | null {
    const row = this.db
      .prepare(`SELECT * FROM searches WHERE id = ?`)
      .get(searchId) as SearchRow | undefined;

    if (!row) return null;

    const resultsRows = this.db
      .prepare(
        `SELECT *
         FROM search_results
         WHERE search_id = ?
         ORDER BY rank_position ASC`
      )
      .all(searchId) as SearchResultRow[];

    const audit = this.parseAudit(row.audit_json);
    const results = resultsRows.map((result) => JSON.parse(result.payload_json) as RankedSearchResult);

    return {
      id: row.id,
      query: row.query,
      status: row.status,
      stage: row.stage,
      progressPercent: row.progress_percent,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      audit,
      results,
    };
  }

  getCachedSearch(cacheKey: string, now = nowIso()): CachedSearchPayload | null {
    const row = this.db
      .prepare(
        `SELECT cache_key, payload_json, created_at, expires_at
         FROM search_cache
         WHERE cache_key = ? AND expires_at > ?`
      )
      .get(cacheKey, now) as SearchCacheRow | undefined;

    if (!row) return null;

    try {
      const parsed = JSON.parse(row.payload_json) as CachedSearchPayload;
      if (!Array.isArray(parsed.results)) return null;

      return {
        createdAt: row.created_at,
        audit: {
          ...DEFAULT_AUDIT,
          ...parsed.audit,
          stores: Array.isArray(parsed.audit?.stores) ? parsed.audit.stores : [],
        },
        results: parsed.results,
      };
    } catch {
      return null;
    }
  }

  upsertCachedSearch(cacheKey: string, payload: CachedSearchPayload, ttlMinutes: number): void {
    const now = nowIso();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO search_cache (cache_key, payload_json, created_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(cache_key)
         DO UPDATE SET payload_json = excluded.payload_json,
                       created_at = excluded.created_at,
                       expires_at = excluded.expires_at`
      )
      .run(cacheKey, JSON.stringify(payload), now, expiresAt);
  }

  cleanupExpiredSearches(now = nowIso()): number {
    const expiredIds = this.db
      .prepare(`SELECT id FROM searches WHERE expires_at < ?`)
      .all(now) as Array<{ id: string }>;

    const tx = this.db.transaction(() => {
      for (const entry of expiredIds) {
        this.db.prepare(`DELETE FROM search_results WHERE search_id = ?`).run(entry.id);
        this.db.prepare(`DELETE FROM searches WHERE id = ?`).run(entry.id);
      }

      this.db.prepare(`DELETE FROM search_cache WHERE expires_at < ?`).run(now);
    });

    tx();

    return expiredIds.length;
  }

  private parseAudit(raw: string | null): SearchAudit {
    if (!raw) return DEFAULT_AUDIT;

    try {
      const parsed = JSON.parse(raw) as SearchAudit;
      return {
        ...DEFAULT_AUDIT,
        ...parsed,
        stores: Array.isArray(parsed.stores) ? parsed.stores : [],
      };
    } catch {
      return DEFAULT_AUDIT;
    }
  }
}