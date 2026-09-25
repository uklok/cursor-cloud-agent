import type { CursorCloudClient } from "./client.js";
import type { ArtifactRef } from "./types.js";

const MAX_ARTIFACTS = 20;

export function artifactKind(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return "image";
  }
  if (["mp4", "webm", "mov"].includes(ext)) {
    return "recording";
  }
  if (["log", "txt"].includes(ext)) {
    return "log";
  }
  if (["md", "markdown"].includes(ext)) {
    return "walkthrough";
  }
  return "file";
}

export async function listArtifactRefs(
  client: CursorCloudClient,
  agentId: string,
  options: { includeDownloads?: boolean } = {},
): Promise<ArtifactRef[]> {
  const listed = await client.listArtifacts(agentId);
  const items = (listed.items ?? []).slice(0, MAX_ARTIFACTS);
  const refs: ArtifactRef[] = [];
  for (const item of items) {
    const path = item.path;
    if (!path) {
      continue;
    }
    const ref: ArtifactRef = {
      id: path,
      path,
      kind: artifactKind(path),
      bytes: item.sizeBytes,
      updatedAt: item.updatedAt,
    };
    if (options.includeDownloads !== false) {
      try {
        const download = await client.getArtifactDownload(agentId, path);
        ref.url = download.url;
        ref.expiresAt = download.expiresAt;
      } catch {
        // Listing still succeeds when a single presign fails.
      }
    }
    refs.push(ref);
  }
  return refs;
}
