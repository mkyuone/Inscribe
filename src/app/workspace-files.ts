// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu

export type WorkspaceEncoding = "utf8" | "base64";

export type WorkspaceBundleFile = {
  path: string;
  mime: string;
  encoding: WorkspaceEncoding;
  content: string;
};

export type WorkspaceBundle = {
  format: "inscribe-workspace-v1";
  exportedAt: string;
  activePath: string | null;
  files: WorkspaceBundleFile[];
};

const TEXT_EXTENSIONS = new Set([
  "py",
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "jsx",
  "tsx",
  "mjs",
  "cjs",
  "sql",
  "sh",
  "bat",
  "ps1",
  "java",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "rs",
  "go",
  "rb",
  "php"
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

const MIME_BY_EXTENSION: Record<string, string> = {
  py: "text/x-python",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  yml: "application/yaml",
  yaml: "application/yaml",
  toml: "application/toml",
  xml: "application/xml",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  ts: "text/typescript",
  jsx: "text/jsx",
  tsx: "text/tsx",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml"
};

export function normalizeWorkspacePath(name: string) {
  const normalized = name.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
  const parts = normalized.split("/");
  const sanitized: string[] = [];
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part || part === ".") continue;
    if (part === ".." || part.includes("\0")) return "";
    sanitized.push(part.replaceAll("/", "-"));
  }
  return sanitized.join("/") || "untitled.py";
}

export function getExtension(path: string) {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : "";
}

export function getBasename(path: string) {
  const normalized = normalizeWorkspacePath(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

export function guessMimeType(path: string, fallback = "") {
  const ext = getExtension(path);
  return MIME_BY_EXTENSION[ext] || fallback || "application/octet-stream";
}

export function isImagePath(path: string, mime = "") {
  return mime.startsWith("image/") || IMAGE_EXTENSIONS.has(getExtension(path));
}

export function isJsonPath(path: string, mime = "") {
  return mime === "application/json" || getExtension(path) === "json";
}

export function isCsvPath(path: string, mime = "") {
  const ext = getExtension(path);
  return mime === "text/csv" || mime === "text/tab-separated-values" || ext === "csv" || ext === "tsv";
}

export function isTextPath(path: string, mime = "") {
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json" || mime === "application/xml" || mime === "application/yaml") return true;
  return TEXT_EXTENSIONS.has(getExtension(path));
}

export function getFileIcon(path: string, mime = "") {
  if (isImagePath(path, mime)) return "image";
  if (isJsonPath(path, mime)) return "description";
  if (isCsvPath(path, mime)) return "view_list";
  if (getExtension(path) === "py") return "code";
  if (isTextPath(path, mime)) return "description";
  return "insert_drive_file";
}

export function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value >= 10 || unitIdx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIdx]}`;
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function dataUrlFromBase64(base64: string, mime: string) {
  return `data:${mime || "application/octet-stream"};base64,${base64}`;
}

export function parseWorkspaceBundle(text: string): WorkspaceBundle | null {
  try {
    const parsed = JSON.parse(text) as Partial<WorkspaceBundle>;
    if (parsed.format !== "inscribe-workspace-v1" || !Array.isArray(parsed.files)) return null;
    const files = parsed.files
      .filter(
        (file): file is WorkspaceBundleFile =>
          !!file &&
          typeof file.path === "string" &&
          typeof file.mime === "string" &&
          (file.encoding === "utf8" || file.encoding === "base64") &&
          typeof file.content === "string"
      )
      .map((file) => {
        const path = normalizeWorkspacePath(file.path);
        if (!path) return null;
        return {
          path,
          mime: file.mime || guessMimeType(file.path),
          encoding: file.encoding,
          content: file.content
        };
      })
      .filter((file): file is WorkspaceBundleFile => !!file);
    if (!files.length) return null;
    return {
      format: "inscribe-workspace-v1",
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
      activePath: typeof parsed.activePath === "string" ? normalizeWorkspacePath(parsed.activePath) || null : null,
      files
    };
  } catch {
    return null;
  }
}
