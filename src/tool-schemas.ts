import { Type } from "typebox";

const mode = Type.Optional(Type.Union([Type.Literal("agent"), Type.Literal("plan")]));

export const launchParamsSchema = Type.Object(
  {
    prompt: Type.String({
      minLength: 1,
      description: "Senior brief for the Cloud agent. No secrets.",
    }),
    fresh: Type.Optional(
      Type.Boolean({
        description:
          "true = new Cloud agent (then pass env). false = reuse (then pick from the returned named sessions). Omit to let the plugin resolve from this OpenClaw session.",
      }),
    ),
    agentId: Type.Optional(
      Type.String({
        description: "Reuse this bc-… instead of launching. Use after the plugin returns phase=choose.",
      }),
    ),
    sessionName: Type.Optional(
      Type.String({
        maxLength: 100,
        description: "Human label for this chat↔Cloud mapping. Shown in reuse lists.",
      }),
    ),
    env: Type.Optional(
      Type.String({
        description: "Registry env id (not a free-form Cursor env payload). Required when fresh=true.",
      }),
    ),
    name: Type.Optional(Type.String({ maxLength: 100, description: "Display name for the durable agent." })),
    model: Type.Optional(Type.String({ description: "Model id from cursor_cloud_models. Omit for the account default." })),
    mode,
    repo: Type.Optional(
      Type.String({
        description:
          "Only if this exact URL is in the env allowRepos. Named cloud envs still omit repos on the API.",
      }),
    ),
    startingRef: Type.Optional(Type.String()),
    autoCreatePR: Type.Optional(Type.Boolean()),
    watch: Type.Optional(
      Type.Boolean({
        description: "Start a detached waiter that notifies on terminal status. Default true.",
      }),
    ),
    idempotencyKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const replyParamsSchema = Type.Object(
  {
    agentId: Type.String({ description: "Existing bc-… agent id." }),
    prompt: Type.String({ minLength: 1 }),
    mode,
    watch: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const statusParamsSchema = Type.Object(
  {
    agentId: Type.String({ description: "bc-… agent id." }),
    runId: Type.Optional(Type.String({ description: "run-… id. Defaults to the agent's latest run." })),
  },
  { additionalProperties: false },
);

export const cancelParamsSchema = statusParamsSchema;

export const watchParamsSchema = Type.Object(
  {
    agentId: Type.String({ description: "bc-… agent id." }),
    runId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const listParamsSchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  },
  { additionalProperties: false },
);

export const envsParamsSchema = Type.Object(
  {
    role: Type.Optional(
      Type.Union([Type.Literal("base"), Type.Literal("project")], {
        description: "base = clone-the-target. project = repos already loaded.",
      }),
    ),
    project: Type.Optional(Type.String({ description: "Filter by configured project key." })),
    repo: Type.Optional(
      Type.String({
        description: "Recommend the project env whose allowRepos lists this https URL.",
      }),
    ),
    refresh: Type.Optional(
      Type.Boolean({
        description:
          "Fetch named environments from GET /v1/agents + GET /v1/agents/{id} and write the local catalog.",
      }),
    ),
  },
  { additionalProperties: false },
);

export const agentsParamsSchema = Type.Object(
  {
    env: Type.Optional(Type.String({ description: "Registry env id to filter local bc-… rows." })),
    project: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const emptyParamsSchema = Type.Object({}, { additionalProperties: false });

export function jsonSchema(schema: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
}
