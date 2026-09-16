import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { withSpan } from "@lobbystack/telemetry/node";

export type LocalStorageConfig = {
  rootPath: string;
  publicBaseUrl: string;
  signingSecret: string;
};

type LocalStorageOperation = "upload" | "download";

export type LocalStorageToken = {
  operation: LocalStorageOperation;
  key: string;
  expiresAt: number;
  contentType?: string;
  length?: number;
  checksum?: string;
  range?: string;
};

type StoredMetadata = {
  contentType: string;
  length: number;
  checksum?: string;
};

export class LocalStorageValidationError extends Error {}

function validatedSegments(key: string): string[] {
  if (!key || key.includes("\0") || key.includes("\\") || isAbsolute(key)) {
    throw new Error("Invalid storage key.");
  }
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid storage key.");
  }
  return segments;
}

export function resolveStoragePath(rootPath: string, namespace: "objects" | "metadata", key: string): string {
  const root = resolve(rootPath, namespace);
  const candidate = resolve(root, ...validatedSegments(key)) + (namespace === "metadata" ? ".json" : "");
  const pathFromRoot = relative(root, candidate);
  if (!pathFromRoot || pathFromRoot === ".." || pathFromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(pathFromRoot)) {
    throw new Error("Invalid storage key.");
  }
  return candidate;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeToken(claims: LocalStorageToken, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyLocalStorageToken(token: string, secret: string, expectedOperation: LocalStorageOperation): LocalStorageToken {
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) throw new Error("Invalid storage token.");
  const expectedSignature = signature(payload, secret);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error("Invalid storage token.");

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid storage token.");
  }
  if (!value || typeof value !== "object") throw new Error("Invalid storage token.");
  const claims = value as Partial<LocalStorageToken>;
  if (claims.operation !== expectedOperation || typeof claims.key !== "string" || typeof claims.expiresAt !== "number" || claims.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid or expired storage token.");
  }
  validatedSegments(claims.key);
  if (claims.contentType !== undefined && typeof claims.contentType !== "string") throw new Error("Invalid storage token.");
  if (claims.length !== undefined && (!Number.isSafeInteger(claims.length) || claims.length < 0)) throw new Error("Invalid storage token.");
  if (claims.checksum !== undefined && typeof claims.checksum !== "string") throw new Error("Invalid storage token.");
  if (claims.range !== undefined && typeof claims.range !== "string") throw new Error("Invalid storage token.");
  return claims as LocalStorageToken;
}

function byteRange(range: string | undefined, length: number): { start: number; end: number } | undefined {
  if (!range) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]) || length === 0) throw new Error("Invalid byte range.");
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  const start = startText ? Number(startText) : Math.max(0, length - Number(endText));
  const end = endText && startText ? Math.min(length - 1, Number(endText)) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= length) throw new Error("Invalid byte range.");
  return { start, end };
}

export class LocalStorageProvider {
  private readonly rootPath: string;
  private readonly publicBaseUrl: string;
  private readonly signingSecret: string;

  constructor(config: LocalStorageConfig) {
    if (!config.signingSecret) throw new Error("LOCAL_STORAGE_SIGNING_SECRET or INTERNAL_SERVICE_SECRET is required for local storage.");
    this.rootPath = resolve(config.rootPath);
    this.publicBaseUrl = config.publicBaseUrl;
    this.signingSecret = config.signingSecret;
  }

  private objectPath(key: string): string {
    return resolveStoragePath(this.rootPath, "objects", key);
  }

  private metadataPath(key: string): string {
    return resolveStoragePath(this.rootPath, "metadata", key);
  }

  private async run<T>(operation: string, callback: () => Promise<T>): Promise<T> {
    return await withSpan(`storage.${operation}`, { attributes: { "storage.system": "file", "storage.operation": operation } }, callback);
  }

  private signedUrl(claims: LocalStorageToken): string {
    const url = new URL("/api/storage/local", this.publicBaseUrl);
    url.searchParams.set("token", encodeToken(claims, this.signingSecret));
    return url.toString();
  }

  async ensureReady(): Promise<void> {
    await this.run("health_check", async () => {
      await mkdir(resolve(this.rootPath, "objects"), { recursive: true });
      await mkdir(resolve(this.rootPath, "metadata"), { recursive: true });
      await access(this.rootPath, constants.R_OK | constants.W_OK);
      const healthDirectory = resolve(this.rootPath, ".health");
      const healthFile = resolve(healthDirectory, `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      await mkdir(healthDirectory, { recursive: true });
      try {
        await writeFile(healthFile, "ok", { flag: "wx" });
        await readFile(healthFile);
      } finally {
        await rm(healthFile, { force: true });
      }
    });
  }

  async createUpload(input: { key: string; contentType: string; length: number; checksum?: string }): Promise<{ url: string; headers: Record<string, string> }> {
    validatedSegments(input.key);
    return {
      url: this.signedUrl({ operation: "upload", key: input.key, expiresAt: Math.floor(Date.now() / 1000) + 900, contentType: input.contentType, length: input.length, ...(input.checksum ? { checksum: input.checksum } : {}) }),
      headers: {
        "content-type": input.contentType,
        "content-length": String(input.length),
        ...(input.checksum ? { "x-lobbystack-checksum-sha256": input.checksum } : {}),
      },
    };
  }

  async putObject(input: { key: string; body: Uint8Array; contentType: string; checksum?: string }): Promise<void> {
    async function* body(): AsyncGenerator<Uint8Array> {
      yield input.body;
    }
    await this.putObjectStream({
      key: input.key,
      body: body(),
      contentType: input.contentType,
      expectedLength: input.body.byteLength,
      ...(input.checksum ? { expectedChecksum: input.checksum } : {}),
    });
  }

  async putObjectStream(input: { key: string; body: AsyncIterable<Uint8Array>; contentType: string; expectedLength: number; expectedChecksum?: string }): Promise<void> {
    await this.ensureReady();
    await this.run("put", async () => {
      const objectPath = this.objectPath(input.key);
      const metadataPath = this.metadataPath(input.key);
      await Promise.all([mkdir(dirname(objectPath), { recursive: true }), mkdir(dirname(metadataPath), { recursive: true })]);
      const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const temporaryObjectPath = `${objectPath}.${suffix}.tmp`;
      const temporaryMetadataPath = `${metadataPath}.${suffix}.tmp`;
      try {
        let length = 0;
        const hash = createHash("sha256");
        const validate = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            length += chunk.byteLength;
            if (length > input.expectedLength) {
              callback(new LocalStorageValidationError("Uploaded object is larger than the signed length."));
              return;
            }
            hash.update(chunk);
            callback(null, chunk);
          },
        });
        await pipeline(Readable.from(input.body), validate, createWriteStream(temporaryObjectPath, { flags: "wx" }));
        if (length !== input.expectedLength) throw new LocalStorageValidationError("Uploaded object length does not match the signed length.");
        const checksum = hash.digest("base64");
        if (input.expectedChecksum && checksum !== input.expectedChecksum) throw new LocalStorageValidationError("Uploaded object checksum does not match the signed request.");
        const metadata: StoredMetadata = { contentType: input.contentType, length, checksum };
        await writeFile(temporaryMetadataPath, JSON.stringify(metadata), { flag: "wx" });
        await rename(temporaryObjectPath, objectPath);
        await rename(temporaryMetadataPath, metadataPath);
      } finally {
        await Promise.all([rm(temporaryObjectPath, { force: true }), rm(temporaryMetadataPath, { force: true })]);
      }
    });
  }

  async headObject(input: { key: string }): Promise<{ length: number; contentType: string; checksum?: string } | null> {
    await this.ensureReady();
    try {
      return await this.run("head", async () => {
        const [metadataText, objectStat] = await Promise.all([readFile(this.metadataPath(input.key), "utf8"), stat(this.objectPath(input.key))]);
        const metadata = JSON.parse(metadataText) as StoredMetadata;
        return { length: objectStat.size, contentType: metadata.contentType, ...(metadata.checksum ? { checksum: metadata.checksum } : {}) };
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async getObject(input: { key: string; range?: string }): Promise<Uint8Array> {
    await this.ensureReady();
    return await this.run("get", async () => {
      const body = await readFile(this.objectPath(input.key));
      const parsedRange = byteRange(input.range, body.byteLength);
      return parsedRange ? body.subarray(parsedRange.start, parsedRange.end + 1) : body;
    });
  }

  async openObject(input: { key: string; range?: string }): Promise<{ body: Readable; length: number; totalLength: number; start?: number; end?: number }> {
    await this.ensureReady();
    return await this.run("get", async () => {
      const objectPath = this.objectPath(input.key);
      const objectStat = await stat(objectPath);
      const parsedRange = byteRange(input.range, objectStat.size);
      return {
        body: createReadStream(objectPath, parsedRange ? { start: parsedRange.start, end: parsedRange.end } : undefined),
        length: parsedRange ? parsedRange.end - parsedRange.start + 1 : objectStat.size,
        totalLength: objectStat.size,
        ...(parsedRange ? { start: parsedRange.start, end: parsedRange.end } : {}),
      };
    });
  }

  async createDownloadUrl(input: { key: string; expiresInSeconds: number; range?: string }): Promise<string> {
    validatedSegments(input.key);
    return this.signedUrl({ operation: "download", key: input.key, expiresAt: Math.floor(Date.now() / 1000) + Math.min(86_400, Math.max(1, input.expiresInSeconds)), ...(input.range ? { range: input.range } : {}) });
  }

  async deleteObject(input: { key: string }): Promise<void> {
    await this.ensureReady();
    await this.run("delete", async () => {
      await Promise.all([rm(this.objectPath(input.key), { force: true }), rm(this.metadataPath(input.key), { force: true })]);
    });
  }

  async copyObject(input: { sourceKey: string; destinationKey: string }): Promise<void> {
    const source = await this.getObject({ key: input.sourceKey });
    const metadata = await this.headObject({ key: input.sourceKey });
    if (!metadata) throw new Error("Source object not found.");
    await this.putObject({ key: input.destinationKey, body: source, contentType: metadata.contentType, ...(metadata.checksum ? { checksum: metadata.checksum } : {}) });
  }

  verifyToken(token: string, operation: LocalStorageOperation): LocalStorageToken {
    return verifyLocalStorageToken(token, this.signingSecret, operation);
  }
}
