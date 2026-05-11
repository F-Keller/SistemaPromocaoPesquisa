import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/env";
import { StealthBrowser } from "../src/search/scraping/stealthBrowser";

const browserMock = vi.hoisted(() => {
  const state: {
    routeHandler: null | ((route: any) => Promise<unknown>);
    page: any;
    context: any;
    browser: any;
    chromium: any;
  } = {
    routeHandler: null,
    page: null,
    context: null,
    browser: null,
    chromium: null,
  };

  state.page = {
    route: vi.fn(async (_pattern: string, handler: (route: any) => Promise<unknown>) => {
      state.routeHandler = handler;
    }),
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    close: vi.fn(async () => undefined),
  };

  state.context = {
    newPage: vi.fn(async () => state.page),
    browser: vi.fn(() => state.browser),
    close: vi.fn(async () => undefined),
  };

  state.browser = {
    isConnected: vi.fn(() => true),
    newContext: vi.fn(async () => state.context),
    close: vi.fn(async () => undefined),
  };

  state.chromium = {
    use: vi.fn(),
    launch: vi.fn(async () => state.browser),
    launchPersistentContext: vi.fn(async () => state.context),
  };

  return state;
});

vi.mock("playwright-extra", () => ({
  chromium: browserMock.chromium,
}));

vi.mock("puppeteer-extra-plugin-stealth", () => ({
  default: vi.fn(() => ({ name: "stealth" })),
}));

const makeRoute = (resourceType: string) => {
  const abort = vi.fn(async () => undefined);
  const continueRequest = vi.fn(async () => undefined);

  return {
    abort,
    continue: continueRequest,
    request: () => ({
      resourceType: () => resourceType,
    }),
  };
};

describe("StealthBrowser network interception", () => {
  beforeEach(() => {
    browserMock.routeHandler = null;
    vi.clearAllMocks();
  });

  it("deve instalar interceptacao de rede antes de entregar a page ao worker", async () => {
    const config = {
      ...loadConfig(),
      scraperUseHeadlessFallback: true,
      scraperTimeoutHeadlessMs: 18000,
      proxyUrl: "",
    };
    const logger = { debug: vi.fn() };
    const browser = new StealthBrowser(config, logger as any);
    let routeInstalledBeforeWorker = false;

    await browser.withPage(async () => {
      routeInstalledBeforeWorker = Boolean(browserMock.routeHandler);
    });

    expect(browserMock.page.route).toHaveBeenCalledWith("**/*", expect.any(Function));
    expect(routeInstalledBeforeWorker).toBe(true);
    expect(browserMock.page.setDefaultTimeout).toHaveBeenCalledWith(18000);
    expect(browserMock.page.setDefaultNavigationTimeout).toHaveBeenCalledWith(18000);
  });

  it("deve abrir page persistente da Shopee sem interceptacao quando recursos pesados forem permitidos", async () => {
    const profileDir = "C:\\tmp\\shopee-profile-test";
    const config = {
      ...loadConfig(),
      scraperUseHeadlessFallback: true,
      scraperTimeoutHeadlessMs: 18000,
      proxyUrl: "",
      shopeeBrowserProfileDir: profileDir,
    };
    const logger = { debug: vi.fn() };
    const browser = new StealthBrowser(config, logger as any);
    let routeInstalledBeforeWorker = false;

    await browser.withPersistentPage(
      {
        label: "shopee",
        profileDir,
        blockResources: false,
      },
      async () => {
        routeInstalledBeforeWorker = Boolean(browserMock.routeHandler);
      },
    );

    expect(browserMock.chromium.launchPersistentContext).toHaveBeenCalledWith(
      profileDir,
      expect.objectContaining({
        userAgent: config.scraperUserAgent,
        viewport: { width: 1366, height: 768 },
      }),
    );
    expect(browserMock.page.route).not.toHaveBeenCalled();
    expect(routeInstalledBeforeWorker).toBe(false);
  });

  it.each(["image", "media", "font", "stylesheet", "other"])(
    "deve abortar recurso pesado do tipo %s",
    async (resourceType) => {
      const config = {
        ...loadConfig(),
        scraperUseHeadlessFallback: true,
        scraperTimeoutHeadlessMs: 18000,
        proxyUrl: "",
      };
      const logger = { debug: vi.fn() };
      const browser = new StealthBrowser(config, logger as any);

      await browser.withPage(async () => undefined);
      const route = makeRoute(resourceType);

      await browserMock.routeHandler?.(route);

      expect(route.abort).toHaveBeenCalledTimes(1);
      expect(route.continue).not.toHaveBeenCalled();
    },
  );

  it.each(["document", "script", "xhr", "fetch"])(
    "deve continuar recurso necessario do tipo %s",
    async (resourceType) => {
      const config = {
        ...loadConfig(),
        scraperUseHeadlessFallback: true,
        scraperTimeoutHeadlessMs: 18000,
        proxyUrl: "",
      };
      const logger = { debug: vi.fn() };
      const browser = new StealthBrowser(config, logger as any);

      await browser.withPage(async () => undefined);
      const route = makeRoute(resourceType);

      await browserMock.routeHandler?.(route);

      expect(route.continue).toHaveBeenCalledTimes(1);
      expect(route.abort).not.toHaveBeenCalled();
    },
  );
});
