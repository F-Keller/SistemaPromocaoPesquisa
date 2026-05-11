import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import { AppConfig } from "../config/env";
import { AppLogger } from "../config/logger";
import { SearchService } from "../search/searchService";
import { AddressInput, SearchInput } from "../search/types";
import { renderSearchPage } from "../ui/searchTemplates";

interface CreateServerParams {
  config: AppConfig;
  logger: AppLogger;
  searchService: SearchService;
}

const requiredFields: Array<keyof AddressInput> = [
  "street",
  "number",
  "district",
  "city",
  "state",
  "zipCode",
];

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const STORE_LOGO_FILES = new Set([
  "Amazon_icon.png",
  "Logotipo_MercadoLivre.png",
  "shopee-bag-logo-free-transparent-icon-17.png",
  "amazon.jpg",
  "mercadolivre.jpg",
  "shopee.jpg",
]);

const IMAGE_ASSET_FILES = new Set(["moeda1real-removebg-preview.png", "garimpei-logo.png"]);

function parseSearchInput(body: unknown): { input: SearchInput | null; error: string | null } {
  if (!body || typeof body !== "object") {
    return { input: null, error: "Payload invalido." };
  }

  const payload = body as Record<string, unknown>;
  const query = normalizeString(payload.query);

  if (!query || query.length < 2) {
    return { input: null, error: "Informe um termo de busca valido." };
  }

  const addressRaw = payload.address;
  if (!addressRaw || typeof addressRaw !== "object") {
    return { input: null, error: "Endereco invalido." };
  }

  const addressObj = addressRaw as Record<string, unknown>;
  const address: AddressInput = {
    street: normalizeString(addressObj.street),
    number: normalizeString(addressObj.number),
    district: normalizeString(addressObj.district),
    city: normalizeString(addressObj.city),
    state: normalizeString(addressObj.state).toUpperCase(),
    zipCode: normalizeString(addressObj.zipCode),
    complement: normalizeString(addressObj.complement) || null,
  };

  for (const field of requiredFields) {
    if (!address[field]) {
      return { input: null, error: `Campo obrigatorio ausente: ${field}.` };
    }
  }

  if (address.state.length !== 2) {
    return { input: null, error: "UF deve ter 2 caracteres." };
  }

  return {
    input: {
      query,
      address,
    },
    error: null,
  };
}

export function createServer(params: CreateServerParams) {
  const { logger, searchService } = params;
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/assets/store-logos/:file", (req, res, next) => {
    const file = String(req.params.file ?? "");
    if (!STORE_LOGO_FILES.has(file)) {
      return res.status(404).json({ error: "Logo nao encontrada." });
    }

    return res.sendFile(path.resolve(process.cwd(), "src", "imgs", file), (error) => {
      if (error) next(error);
    });
  });

  app.get("/assets/imgs/:file", (req, res, next) => {
    const file = String(req.params.file ?? "");
    if (!IMAGE_ASSET_FILES.has(file)) {
      return res.status(404).json({ error: "Imagem nao encontrada." });
    }

    return res.sendFile(path.resolve(process.cwd(), "src", "imgs", file), (error) => {
      if (error) next(error);
    });
  });

  app.get("/", (_req, res) => {
    res.type("html").send(renderSearchPage());
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      now: new Date().toISOString(),
      search: searchService.getHealth(),
    });
  });

  app.post("/api/searches", (req, res) => {
    const { input, error } = parseSearchInput(req.body);
    if (!input) {
      return res.status(400).json({ error });
    }

    const forceRefresh =
      req.body && typeof req.body === "object" && (req.body as Record<string, unknown>).forceRefresh === true;
    const searchId = searchService.createSearch(input, { forceRefresh });
    return res.status(202).json({
      searchId,
      statusUrl: `/api/searches/${searchId}`,
    });
  });

  app.get("/api/searches/:id", (req, res) => {
    const searchId = String(req.params.id);
    const snapshot = searchService.getSearch(searchId);

    if (!snapshot) {
      return res.status(404).json({ error: "Busca nao encontrada ou expirada." });
    }

    return res.json(snapshot);
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Erro nao tratado em rota HTTP.");
    return res.status(500).json({ error: "Erro interno." });
  });

  return app;
}
