import { ensureHarvested, createRuntime } from "cursor-cloud-core";

export type HarvestApi = {
  pluginConfig?: unknown;
  registerService: (service: {
    id: string;
    start: (ctx: { serviceHealth?: { clearFailure?: () => void; reportFailure?: (error: unknown) => void } }) => void;
    stop: () => void;
  }) => void;
};

export function registerHarvestService(api: HarvestApi): void {
  api.registerService({
    id: "cursor-cloud-env-harvest",
    start(ctx) {
      void runInitHarvest(api.pluginConfig).then(
        () => ctx.serviceHealth?.clearFailure?.(),
        (error) => ctx.serviceHealth?.reportFailure?.(error),
      );
    },
    stop() {},
  });
}

export async function runInitHarvest(pluginConfig: unknown, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const runtime = createRuntime(pluginConfig as never, env);
  await ensureHarvested(runtime);
}
