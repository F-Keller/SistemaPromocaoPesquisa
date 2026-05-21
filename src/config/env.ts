import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const resolveConfiguredPath = (value: string): string =>
  path.isAbsolute(value) || value.startsWith("/") ? value : path.resolve(process.cwd(), value);

const resolveRuntimePath = (
  value: string | undefined,
  fallback: string,
  isVercelRuntime: boolean,
): string => {
  const configuredValue = value ?? fallback;

  if (isVercelRuntime && !configuredValue.startsWith("/tmp")) {
    return fallback;
  }

  return resolveConfiguredPath(configuredValue);
};

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isTest = nodeEnv.toLowerCase() === "test";
  const isVercelRuntime = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const requestedEnableMockSources = toBoolean(process.env.ENABLE_MOCK_SOURCES, false);
  const defaultDatabasePath = isVercelRuntime ? "/tmp/adsbot.sqlite" : "./data/adsbot.sqlite";
  const defaultBackupDir = isVercelRuntime ? "/tmp/backups" : "./backups";
  const defaultShopeeBrowserProfileDir = isVercelRuntime
    ? "/tmp/browser-profiles/shopee"
    : "./data/browser-profiles/shopee";

  const sandboxGroupId = process.env.WHATSAPP_SANDBOX_GROUP_ID ?? "sandbox@g.us";
  const productionGroups = toList(process.env.WHATSAPP_GROUP_IDS).filter(
    (groupId) => groupId !== sandboxGroupId,
  );

  return {
    nodeEnv,
    isTest,
    port: toNumber(process.env.PORT, 3333),
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3333",
    timezone: process.env.TIMEZONE ?? "America/Sao_Paulo",

    databasePath: resolveRuntimePath(process.env.DATABASE_PATH, defaultDatabasePath, isVercelRuntime),
    backupDir: resolveRuntimePath(process.env.BACKUP_DIR, defaultBackupDir, isVercelRuntime),

    searchTtlMinutes: toNumber(process.env.SEARCH_TTL_MINUTES, 60),
    searchCleanupCron: process.env.SEARCH_CLEANUP_CRON ?? "*/15 * * * *",
    searchMaxResults: toNumber(process.env.SEARCH_MAX_RESULTS, 30),
    searchMaxResultsPerStore: toNumber(process.env.SEARCH_MAX_RESULTS_PER_STORE, 10),
    searchMaxItemsPerStore: toNumber(process.env.SEARCH_MAX_ITEMS_PER_STORE, 30),
    searchCacheVersion: process.env.SEARCH_CACHE_VERSION ?? "v7-shopee-session",

    scraperDefaultMode: (process.env.SCRAPER_DEFAULT_MODE ?? "scrape").toLowerCase(),
    scraperUseHeadlessFallback: toBoolean(process.env.SCRAPER_USE_HEADLESS_FALLBACK, true),
    scraperTimeoutTotalMs: toNumber(process.env.SCRAPER_TIMEOUT_TOTAL_MS, 20000),
    scraperTimeoutHttpMs: toNumber(process.env.SCRAPER_TIMEOUT_HTTP_MS, 6000),
    scraperTimeoutHeadlessMs: toNumber(process.env.SCRAPER_TIMEOUT_HEADLESS_MS, 10000),
    scraperMaxHeadlessAttemptsPerStore: toNumber(process.env.SCRAPER_MAX_HEADLESS_ATTEMPTS_PER_STORE, 2),
    scraperProductConcurrency: toNumber(process.env.SCRAPER_PRODUCT_CONCURRENCY, 2),
    scraperCacheTtlMinutes: toNumber(process.env.SCRAPER_CACHE_TTL_MINUTES, 10),
    scraperUserAgent:
      process.env.SCRAPER_USER_AGENT ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    proxyUrl: process.env.PROXY_URL?.trim() ?? "",
    shopeeBrowserProfileDir: resolveRuntimePath(
      process.env.SHOPEE_BROWSER_PROFILE_DIR,
      defaultShopeeBrowserProfileDir,
      isVercelRuntime,
    ),

    enableScrapingFallback: toBoolean(process.env.ENABLE_SCRAPING_FALLBACK, true),
    externalRequestTimeoutMs: toNumber(process.env.EXTERNAL_REQUEST_TIMEOUT_MS, 15000),

    collectorCron: process.env.COLLECTOR_CRON ?? "*/5 * * * *",
    backupCron: process.env.BACKUP_CRON ?? "30 3 * * *",
    panelUsername: process.env.PANEL_USERNAME ?? "admin",
    panelPassword: process.env.PANEL_PASSWORD ?? "admin123",
    sessionSecret: process.env.SESSION_SECRET ?? "change-me",
    disableAuth: toBoolean(process.env.DISABLE_AUTH, false),
    hookText: process.env.HOOK_TEXT ?? "BUGGGGGG",
    ctaText: process.env.CTA_TEXT ?? "Corre antes que acabe!",
    whatsappMode: (process.env.WHATSAPP_MODE ?? "console").toLowerCase(),
    whatsappSandboxGroupId: sandboxGroupId,
    whatsappProductionGroups: productionGroups,
    whatsappSessionPath:
      process.env.WHATSAPP_SESSION_PATH ?? path.resolve(process.cwd(), ".wwebjs_auth"),
    minIntervalSeconds: toNumber(process.env.MIN_INTERVAL_SECONDS, 45),
    dailyCapPerGroup: toNumber(process.env.DAILY_CAP_PER_GROUP, 60),
    sendMaxRetries: toNumber(process.env.SEND_MAX_RETRIES, 3),
    sendBaseBackoffSeconds: toNumber(process.env.SEND_BASE_BACKOFF_SECONDS, 30),
    dispatcherPollSeconds: toNumber(process.env.DISPATCHER_POLL_SECONDS, 8),

    enableMockSources: isTest && requestedEnableMockSources,
    enableShopeeSearch: toBoolean(process.env.ENABLE_SHOPEE_SEARCH, false),

    store: {
      amazon: {
        feedUrl: process.env.AMAZON_FEED_URL ?? "",
        apiKey: process.env.AMAZON_API_KEY ?? "",
        affiliateTag: process.env.AMAZON_AFFILIATE_TAG ?? "",
        searchUrlTemplate:
          process.env.AMAZON_SEARCH_URL_TEMPLATE ??
          "https://www.amazon.com.br/s?k={query}",
      },
      mercadolivre: {
        feedUrl: process.env.MERCADOLIVRE_FEED_URL ?? "",
        apiKey: process.env.MERCADOLIVRE_API_KEY ?? "",
        affiliateId: process.env.ML_AFFILIATE_ID ?? process.env.MERCADOLIVRE_AFFILIATE_ID ?? "",
        affiliateUrlTemplate: process.env.MERCADOLIVRE_AFFILIATE_URL_TEMPLATE ?? "",
        searchUrlTemplate:
          process.env.MERCADOLIVRE_SEARCH_URL_TEMPLATE ??
          "https://lista.mercadolivre.com.br/{query}",
      },
      shopee: {
        feedUrl: process.env.SHOPEE_FEED_URL ?? "",
        apiKey: process.env.SHOPEE_API_KEY ?? "",
        affiliateId: process.env.SHOPEE_AFFILIATE_ID ?? "",
        affiliateUrlTemplate: process.env.SHOPEE_AFFILIATE_URL_TEMPLATE ?? "",
        searchUrlTemplate:
          process.env.SHOPEE_SEARCH_URL_TEMPLATE ??
          "https://shopee.com.br/search?keyword={query}",
      },
    },
  };
}
