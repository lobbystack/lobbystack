import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageObjectInput = {
  bucket: string;
  key: string;
  contentType: string;
  length: number;
  checksumSha256: string;
};

export type StorageUpload = {
  url: string;
  headers: Record<string, string>;
};

export type StorageHead = {
  length: number;
  contentType?: string;
  checksumSha256?: string;
  etag?: string;
};

export type S3StorageConfig = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  bucket: string;
  signedUrlExpiresIn: number;
};

export function s3StorageConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): S3StorageConfig | null {
  const accessKeyId = env.S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY;
  const bucket = env.S3_BUCKET ?? env.S3_STORAGE_FILES_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    region: env.S3_REGION ?? env.AWS_REGION ?? "us-east-1",
    accessKeyId,
    secretAccessKey,
    forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? "false") === "true",
    bucket,
    signedUrlExpiresIn: Number(env.S3_SIGNED_URL_EXPIRES_IN ?? 900),
  };
}

export class S3StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createUpload(input: Omit<StorageObjectInput, "bucket">): Promise<StorageUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.length,
      Metadata: { "checksum-sha256": input.checksumSha256 },
    });
    return {
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.config.signedUrlExpiresIn,
      }),
      headers: {
        "content-type": input.contentType,
        "x-amz-meta-checksum-sha256": input.checksumSha256,
      },
    };
  }

  async putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    checksumSha256: string;
  }): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.byteLength,
      Metadata: { "checksum-sha256": input.checksumSha256 },
    }));
  }

  async headObject(input: { key: string }): Promise<StorageHead> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: input.key }),
    );
    return {
      length: result.ContentLength ?? 0,
      ...(result.ContentType ? { contentType: result.ContentType } : {}),
      ...(result.Metadata?.["checksum-sha256"]
        ? { checksumSha256: result.Metadata["checksum-sha256"] }
        : {}),
      ...(result.ETag ? { etag: result.ETag } : {}),
    };
  }

  async getObject(input: { key: string }): Promise<{
    body: unknown;
    contentType?: string;
    length?: number;
  }> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: input.key }),
    );
    return {
      body: result.Body,
      ...(result.ContentType ? { contentType: result.ContentType } : {}),
      ...(result.ContentLength !== undefined ? { length: result.ContentLength } : {}),
    };
  }

  async createDownloadUrl(input: { key: string; expiresIn?: number }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: input.key }),
      { expiresIn: input.expiresIn ?? this.config.signedUrlExpiresIn },
    );
  }

  async deleteObject(input: { key: string }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: input.key }),
    );
  }

  async copyObject(input: { sourceKey: string; destinationKey: string }): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: input.destinationKey,
        CopySource: `${this.config.bucket}/${input.sourceKey}`,
      }),
    );
  }
}
