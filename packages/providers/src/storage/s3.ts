import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { registerStorageHttpEndpoint, withSpan } from "@lobbystack/telemetry/node";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  /** Origins whose browsers upload straight to presigned URLs. */
  corsOrigins?: string[];
};

export class S3StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | undefined;
  private readonly region: string;
  private readonly corsOrigins: string[];
  private corsReady: Promise<void> | undefined;

  constructor(config: S3StorageConfig) {
    this.region = config.region;
    this.bucket = config.bucket;
    this.corsOrigins = config.corsOrigins ?? [];
    registerStorageHttpEndpoint(config.endpoint);
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? false,
      ...(config.accessKeyId && config.secretAccessKey ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } } : {}),
    });
  }

  private async run<T>(operation: string, callback: () => Promise<T>): Promise<T> {
    return await withSpan(`storage.${operation}`, { attributes: { "storage.system": "s3", "storage.operation": operation } }, async () => await callback());
  }

  async ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        try {
          await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch (error) {
          const name = error instanceof Error ? error.name : "";
          if (!name.includes("NotFound") && !name.includes("NoSuchBucket")) {
            throw error;
          }
          await this.client.send(new CreateBucketCommand({
            Bucket: this.bucket,
            ...(this.region !== "us-east-1" ? { CreateBucketConfiguration: { LocationConstraint: this.region as BucketLocationConstraint } } : {}),
          }));
        }
      })();
    }
    try {
      await this.bucketReady;
    } catch (error) {
      this.bucketReady = undefined;
      throw error;
    }
    // Only browser uploads need CORS, so server-side operations never wait on it.
    this.corsReady ??= this.allowBrowserUploads();
  }

  // Browsers PUT uploads straight to presigned URLs. Without a CORS rule for the
  // app origin, the preflight fails and the upload shows "Failed to fetch".
  private async allowBrowserUploads(): Promise<void> {
    if (!this.corsOrigins.length) return;
    try {
      await this.run("configure_cors", async () => {
        const rules = await this.client.send(new GetBucketCorsCommand({ Bucket: this.bucket })).then((result) => result.CORSRules ?? [], (error: unknown) => {
          if (error instanceof Error && error.name === "NoSuchCORSConfiguration") return [];
          throw error;
        });
        const missing = this.corsOrigins.filter((origin) => !rules.some((rule) => rule.AllowedMethods?.includes("PUT") && rule.AllowedOrigins?.some((allowed) => allowed === origin || allowed === "*")));
        if (!missing.length) return;
        // Keep every existing rule: other origins and tools may rely on them.
        await this.client.send(new PutBucketCorsCommand({
          Bucket: this.bucket,
          // Tigris returns an empty ID on each rule; drop it rather than send it back.
          CORSConfiguration: { CORSRules: [...rules.map(({ ID, ...rule }) => ID ? { ID, ...rule } : rule), { AllowedOrigins: missing, AllowedMethods: ["PUT"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }] },
        }));
      });
    } catch (error) {
      // MinIO has no bucket CORS API, and a key without the permission still
      // serves every server-side operation. Anything else may be transient, so
      // the next storage operation tries again. The span records each failure.
      const name = error instanceof Error ? error.name : "";
      if (name !== "NotImplemented" && name !== "AccessDenied") this.corsReady = undefined;
    }
  }

  async ensureReady(): Promise<void> {
    await this.ensureBucket();
    await this.run("health_check", async () => { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })); });
  }

  async createUpload(input: { key: string; contentType: string; length: number; checksum?: string }): Promise<{ url: string; headers: Record<string, string> }> {
    await this.ensureBucket();
    await this.corsReady;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.length,
      ...(input.checksum ? { ChecksumSHA256: input.checksum } : {}),
    });
    const url = await this.run("create_upload", async () => await getSignedUrl(this.client, command, { expiresIn: 900 }));
    return {
      url,
      headers: {
        "content-type": input.contentType,
        "content-length": String(input.length),
        ...(input.checksum ? { "x-amz-checksum-sha256": input.checksum } : {}),
      },
    };
  }

  async putObject(input: { key: string; body: Uint8Array; contentType: string }): Promise<void> {
    await this.ensureBucket();
    await this.run("put", async () => { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: input.key, Body: input.body, ContentType: input.contentType, ContentLength: input.body.byteLength })); });
  }

  async headObject(input: { key: string }): Promise<{ length: number; contentType: string; checksum?: string } | null> {
    await this.ensureBucket();
    try {
      const result = await this.run("head", async () => await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: input.key, ChecksumMode: "ENABLED" })));
      return {
        length: result.ContentLength ?? 0,
        contentType: result.ContentType ?? "application/octet-stream",
        ...(result.ChecksumSHA256 ? { checksum: result.ChecksumSHA256 } : {}),
      };
    } catch (error) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
        return null;
      }
      throw error;
    }
  }

  async getObject(input: { key: string; range?: string }): Promise<Uint8Array> {
    await this.ensureBucket();
    const result = await this.run("get", async () => await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: input.key, ...(input.range ? { Range: input.range } : {}) })));
    if (!result.Body) {
      return new Uint8Array();
    }
    return await result.Body.transformToByteArray();
  }

  async createDownloadUrl(input: { key: string; expiresInSeconds: number; range?: string }): Promise<string> {
    await this.ensureBucket();
    return await this.run("create_download", async () => await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: input.key, ...(input.range ? { Range: input.range } : {}) }), { expiresIn: Math.min(86_400, Math.max(1, input.expiresInSeconds)) }));
  }

  async deleteObject(input: { key: string }): Promise<void> {
    await this.ensureBucket();
    await this.run("delete", async () => { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: input.key })); });
  }
}
