import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SearchRepository } from "../src/db/searchRepository";

describe("SearchRepository", () => {
  let dbPath = "";
  let repository: SearchRepository | null = null;

  afterEach(() => {
    repository?.close();
    repository = null;
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    dbPath = "";
  });

  it("deve migrar search_results legado adicionando image_url e affiliate_url", () => {
    dbPath = path.join(os.tmpdir(), `search-repository-legacy-${Date.now()}-${Math.random()}.sqlite`);

    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE searches (
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

      CREATE TABLE search_results (
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
    `);
    db.close();

    repository = new SearchRepository(dbPath);
    repository.init();

    const checkDb = new Database(dbPath, { readonly: true });
    const columns = checkDb
      .prepare(`PRAGMA table_info(search_results)`)
      .all() as Array<{ name: string }>;
    checkDb.close();

    expect(columns.some((column) => column.name === "image_url")).toBe(true);
    expect(columns.some((column) => column.name === "affiliate_url")).toBe(true);
  });

  it("deve salvar e recuperar resultados com imageUrl e affiliateUrl", () => {
    dbPath = path.join(os.tmpdir(), `search-repository-image-${Date.now()}-${Math.random()}.sqlite`);
    repository = new SearchRepository(dbPath);
    repository.init();

    const searchWithImage = repository.createSearch("Notebook com imagem", 60);
    repository.replaceSearchResults(searchWithImage, [
      {
        rank: 1,
        store: "amazon",
        storeItemId: "abc",
        title: "Notebook com imagem",
        imageUrl: "https://images.example.com/abc.jpg",
        productUrl: "https://example.com/abc",
        affiliateUrl: "https://affiliate.example.com/abc",
        verifiedPrice: 100,
        matchType: "exact",
        matchScore: 0.99,
        warnings: [],
      },
    ]);

    const snapshotWithImage = repository.getSearchSnapshot(searchWithImage);
    expect(snapshotWithImage?.results[0].imageUrl).toBe("https://images.example.com/abc.jpg");
    expect(snapshotWithImage?.results[0].productUrl).toBe("https://example.com/abc");
    expect(snapshotWithImage?.results[0].affiliateUrl).toBe("https://affiliate.example.com/abc");

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(`SELECT affiliate_url, payload_json FROM search_results WHERE search_id = ?`)
      .get(searchWithImage) as { affiliate_url: string; payload_json: string } | undefined;
    db.close();

    const payload = JSON.parse(String(row?.payload_json ?? "{}")) as { affiliateUrl?: string };
    expect(row?.affiliate_url).toBe("https://affiliate.example.com/abc");
    expect(payload.affiliateUrl).toBe("https://affiliate.example.com/abc");

    const searchWithoutImage = repository.createSearch("Notebook sem imagem", 60);
    repository.replaceSearchResults(searchWithoutImage, [
      {
        rank: 1,
        store: "amazon",
        storeItemId: "def",
        title: "Notebook sem imagem",
        productUrl: "https://example.com/def",
        affiliateUrl: "https://example.com/def",
        verifiedPrice: 90,
        matchType: "exact",
        matchScore: 0.95,
        warnings: [],
      },
    ]);

    const snapshotWithoutImage = repository.getSearchSnapshot(searchWithoutImage);
    expect(snapshotWithoutImage?.results[0].imageUrl).toBeUndefined();
  });

  it("deve retornar affiliateUrl usando productUrl em payload legado sem afiliado", () => {
    dbPath = path.join(os.tmpdir(), `search-repository-affiliate-legacy-${Date.now()}-${Math.random()}.sqlite`);
    repository = new SearchRepository(dbPath);
    repository.init();

    const productUrl = "https://example.com/legacy";
    const searchId = repository.createSearch("Notebook legado", 60);
    repository.close();
    repository = null;

    const db = new Database(dbPath);
    db.prepare(
      `INSERT INTO search_results (
        search_id, rank_position, store, title, image_url, affiliate_url, base_price,
        total_final, is_cost_complete, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      searchId,
      1,
      "amazon",
      "Notebook legado",
      null,
      null,
      100,
      100,
      1,
      JSON.stringify({
        rank: 1,
        store: "amazon",
        storeItemId: "legacy-1",
        title: "Notebook legado",
        productUrl,
        verifiedPrice: 100,
        matchType: "exact",
        matchScore: 0.9,
        warnings: [],
      }),
      new Date().toISOString(),
    );
    db.close();

    repository = new SearchRepository(dbPath);
    repository.init();

    const snapshot = repository.getSearchSnapshot(searchId);
    expect(snapshot?.results[0].productUrl).toBe(productUrl);
    expect(snapshot?.results[0].affiliateUrl).toBe(productUrl);
  });
});
