import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
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
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export class S3StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | undefined;
  private readonly region: string;

  constructor(config: S3StorageConfig) {
    this.region = config.region;
    this.bucket = config.bucket;
    registerStorageHttpEndpoint(config.endpoint);
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
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
  }

  async createUpload(input: { key: string; contentType: string; length: number; checksum?: string }): Promise<{ url: string; headers: Record<string, string> }> {
    await this.ensureBucket();
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
      const result = await this.run("head", async () => await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: input.key })));
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

  async copyObject(input: { sourceKey: string; destinationKey: string }): Promise<void> {
    await this.ensureBucket();
    await this.run("copy", async () => { await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: input.destinationKey, CopySource: `${this.bucket}/${input.sourceKey}` })); });
  }
}
