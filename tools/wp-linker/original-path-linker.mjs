import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function normalizeGeneratedPhpForManifest(value) {
  return value.replace(/^(\s*#)(.*?\.hx)(:\d+:.*)$/gm, (_match, prefix, sourcePath, suffix) => {
    const normalized = sourcePath.replaceAll("\\", "/");
    const stablePath =
      normalized.match(/\/std\/(.+)$/)?.[1] ??
      normalized.match(/\/fixtures\/(.+)$/)?.[1]?.replace(/^/, "fixtures/") ??
      normalized.match(/\/src\/(.+)$/)?.[1]?.replace(/^/, "src/") ??
      normalized.split("/").pop();
    return `${prefix}${stablePath}${suffix}`;
  });
}

function stableFileManifest(path) {
  const content = readFileSync(path, "utf8");
  const normalized = normalizeGeneratedPhpForManifest(content);
  return {
    bytes: Buffer.byteLength(normalized),
    sha256: sha256Text(normalized)
  };
}

export function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

export function filesUnder(dir) {
  return walk(dir)
    .map((path) => {
      const manifest = stableFileManifest(path);
      return {
        path: relative(dir, path),
        bytes: manifest.bytes,
        sha256: manifest.sha256
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function assertDistributionPath(path) {
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new Error(`Unsafe distribution path: ${path}`);
  }
}

function renderFile(file) {
  const orderedSegments = [...file.segments].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return `${orderedSegments.map((segment) => segment.content.trimEnd()).join("\n\n")}\n`;
}

export function linkOriginalPathTree({ root, files }) {
  const seenPaths = new Set();
  const linkedFiles = [];

  for (const file of [...files].sort((a, b) => a.distribution_path.localeCompare(b.distribution_path))) {
    assertDistributionPath(file.distribution_path);
    if (seenPaths.has(file.distribution_path)) {
      throw new Error(`Duplicate linked path: ${file.distribution_path}`);
    }
    seenPaths.add(file.distribution_path);

    const outputPath = join(root, file.distribution_path);
    const text = renderFile(file);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, text);

    linkedFiles.push({
      distribution_path: file.distribution_path,
      path: outputPath,
      bytes: Buffer.byteLength(text),
      sha256: sha256Text(text),
      segments: [...file.segments]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((segment) => ({
          id: segment.id,
          order: segment.order,
          kind: segment.kind,
          owner: segment.owner,
          source: segment.source,
          bytes: Buffer.byteLength(segment.content),
          sha256: sha256Text(segment.content)
        }))
    });
  }

  return linkedFiles;
}
