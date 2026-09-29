import { fetchEnvCatalog, mergeCatalogIntoConfig, readEnvCatalog, writeEnvCatalog } from "./env-catalog.js";
import { createRuntime, type Runtime } from "./runtime.js";

const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export async function runInitHarvest(pluginConfig: unknown, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const runtime = createRuntime(pluginConfig as never, env);
  await ensureHarvested(runtime);
}

export async function ensureHarvested(runtime: Runtime): Promise<{ fetched: boolean; error?: string }> {
  const existing = readEnvCatalog(runtime.catalogPath);
  if (!isStale(existing)) {
    runtime.config = mergeCatalogIntoConfig(runtime.config, existing);
    return { fetched: false };
  }
  try {
    const catalog = await fetchEnvCatalog(runtime.client);
    writeEnvCatalog(catalog, runtime.catalogPath);
    runtime.config = mergeCatalogIntoConfig(runtime.config, catalog);
    return { fetched: true };
  } catch (error) {
    runtime.config = mergeCatalogIntoConfig(runtime.config, existing);
    return { fetched: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isStale(catalog: { fetchedAt?: string }): boolean {
  if (!catalog.fetchedAt) {
    return true;
  }
  const at = Date.parse(catalog.fetchedAt);
  return !Number.isFinite(at) || Date.now() - at > CATALOG_MAX_AGE_MS;
}
