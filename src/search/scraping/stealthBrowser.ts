import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { mkdir } from "node:fs/promises";
import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from "playwright";
import { AppConfig } from "../../config/env";
import { AppLogger } from "../../config/logger";

const DEFAULT_VIEWPORT = {
  width: 1366,
  height: 768,
};

const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "stylesheet", "other"]);

let stealthPluginRegistered = false;
let singleton: StealthBrowser | null = null;

export interface StealthPageSession {
  browser: Browser | null;
  context: BrowserContext;
  page: Page;
}

interface PersistentPageOptions {
  profileDir: string;
  label: string;
  blockResources?: boolean;
}

const randomInt = (min: number, max: number): number => {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
};

const registerStealthPlugin = (): void => {
  if (stealthPluginRegistered) return;
  chromium.use(stealthPlugin());
  stealthPluginRegistered = true;
};

export class StealthBrowser {
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;
  private readonly persistentContexts = new Map<string, BrowserContext>();
  private readonly persistentContextPromises = new Map<string, Promise<BrowserContext>>();

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  async withPage<T>(
    worker: (session: StealthPageSession & { browser: Browser }) => Promise<T>,
  ): Promise<T> {
    const session = await this.newIsolatedPage();

    try {
      return await worker(session);
    } finally {
      await session.page.close().catch(() => undefined);
      await session.context.close().catch(() => undefined);
    }
  }

  async withPersistentPage<T>(
    options: PersistentPageOptions,
    worker: (session: StealthPageSession) => Promise<T>,
  ): Promise<T> {
    const context = await this.getPersistentContext(options);
    const page = await context.newPage();

    if (options.blockResources !== false) {
      await this.installNetworkInterception(page);
    }

    page.setDefaultTimeout(this.config.scraperTimeoutHeadlessMs);
    page.setDefaultNavigationTimeout(this.config.scraperTimeoutHeadlessMs);

    try {
      return await worker({
        browser: context.browser(),
        context,
        page,
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async fetchHtml(url: string, timeoutMs: number): Promise<string> {
    const headlessTimeoutMs = this.config.scraperTimeoutHeadlessMs || timeoutMs;

    return this.withPage(async ({ page }) => {
      await page.goto(url, {
        timeout: headlessTimeoutMs,
        waitUntil: "domcontentloaded",
      });

      await page.waitForLoadState("networkidle", { timeout: headlessTimeoutMs }).catch(() => undefined);
      await this.randomDelay(400, 1200);
      await this.randomMouseMovements(page);
      await this.simulateHumanScroll(page);
      await this.randomDelay(250, 900);

      return await page.content();
    });
  }

  async simulateHumanScroll(page: Page): Promise<void> {
    const viewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
    const pageHeight = await page
      .evaluate<number>("Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)")
      .catch(() => viewport.height);
    const scrollableHeight = Math.max(0, pageHeight - viewport.height);

    if (scrollableHeight === 0) {
      await this.randomDelay(200, 600);
      return;
    }

    let scrolled = 0;
    const downSteps = randomInt(3, 6);

    for (let step = 0; step < downSteps; step += 1) {
      const delta = randomInt(Math.round(viewport.height * 0.35), Math.round(viewport.height * 0.8));
      scrolled = Math.min(scrollableHeight, scrolled + delta);
      await page.mouse.wheel(0, delta);
      await this.randomDelay(350, 1200);

      if (scrolled >= scrollableHeight) break;
    }

    const upSteps = randomInt(1, 3);
    for (let step = 0; step < upSteps; step += 1) {
      const delta = randomInt(Math.round(viewport.height * 0.2), Math.round(viewport.height * 0.55));
      await page.mouse.wheel(0, -delta);
      await this.randomDelay(250, 800);
    }
  }

  async randomDelay(min: number, max: number): Promise<void> {
    const delayMs = randomInt(min, max);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async randomMouseMovements(page: Page): Promise<void> {
    const viewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
    const movements = randomInt(4, 9);

    for (let index = 0; index < movements; index += 1) {
      const x = randomInt(20, Math.max(20, viewport.width - 20));
      const y = randomInt(20, Math.max(20, viewport.height - 20));
      await page.mouse.move(x, y, { steps: randomInt(5, 18) });
      await this.randomDelay(120, 420);
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    const persistentContexts = [...this.persistentContexts.values()];
    this.browser = null;
    this.launchPromise = null;
    this.persistentContexts.clear();
    this.persistentContextPromises.clear();

    await Promise.all(persistentContexts.map((context) => context.close().catch(() => undefined)));

    if (browser?.isConnected()) {
      await browser.close();
    }
  }

  private async newIsolatedPage(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext(this.getContextOptions());

    const page = await context.newPage();
    await this.installNetworkInterception(page);
    page.setDefaultTimeout(this.config.scraperTimeoutHeadlessMs);
    page.setDefaultNavigationTimeout(this.config.scraperTimeoutHeadlessMs);

    return { browser, context, page };
  }

  private async getPersistentContext(options: PersistentPageOptions): Promise<BrowserContext> {
    if (!this.config.scraperUseHeadlessFallback) {
      throw new Error("Headless fallback desabilitado por configuracao.");
    }

    const existing = this.persistentContexts.get(options.label);
    if (existing) return existing;

    const existingPromise = this.persistentContextPromises.get(options.label);
    if (existingPromise) return existingPromise;

    registerStealthPlugin();
    await mkdir(options.profileDir, { recursive: true });

    const launchOptions = this.getLaunchOptions();
    const contextPromise = chromium
      .launchPersistentContext(options.profileDir, {
        ...launchOptions,
        ...this.getContextOptions(),
      })
      .then((context) => {
        this.persistentContexts.set(options.label, context);
        this.logger.debug(
          {
            label: options.label,
            hasProxy: Boolean(this.config.proxyUrl),
          },
          "Stealth browser persistente iniciado.",
        );
        return context;
      })
      .finally(() => {
        this.persistentContextPromises.delete(options.label);
      });

    this.persistentContextPromises.set(options.label, contextPromise);
    return contextPromise;
  }

  private async installNetworkInterception(page: Page): Promise<void> {
    await page.route("**/*", (route) => {
      const requestType = route.request().resourceType();

      if (BLOCKED_RESOURCE_TYPES.has(requestType)) {
        return route.abort();
      }

      return route.continue();
    });
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.config.scraperUseHeadlessFallback) {
      throw new Error("Headless fallback desabilitado por configuracao.");
    }

    if (this.browser?.isConnected()) {
      return this.browser;
    }

    if (this.launchPromise) {
      return this.launchPromise;
    }

    registerStealthPlugin();

    const launchOptions = this.getLaunchOptions();

    this.launchPromise = chromium
      .launch(launchOptions)
      .then((browser) => {
        this.browser = browser;
        this.logger.debug(
          {
            hasProxy: Boolean(this.config.proxyUrl),
          },
          "Stealth browser iniciado.",
        );
        return browser;
      })
      .finally(() => {
        this.launchPromise = null;
      });

    return this.launchPromise;
  }

  private getLaunchOptions(): LaunchOptions {
    const launchOptions: LaunchOptions = {
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    };

    if (this.config.proxyUrl) {
      launchOptions.proxy = {
        server: this.config.proxyUrl,
      };
    }

    return launchOptions;
  }

  private getContextOptions(): BrowserContextOptions {
    return {
      userAgent: this.config.scraperUserAgent,
      viewport: DEFAULT_VIEWPORT,
      locale: "pt-BR",
      timezoneId: this.config.timezone,
      extraHTTPHeaders: {
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    };
  }
}

export function getStealthBrowser(config: AppConfig, logger: AppLogger): StealthBrowser {
  if (!singleton) {
    singleton = new StealthBrowser(config, logger);
  }

  return singleton;
}

export async function closeStealthBrowser(): Promise<void> {
  if (!singleton) return;

  const current = singleton;
  singleton = null;
  await current.close();
}
