"use node";

import { Jimp, JimpMime } from "jimp";

import { MAX_SMS_ATTACHMENT_UPLOAD_BYTES } from "../messageAttachments";

export const MESSAGE_IMAGE_PREVIEW_WIDTH = 640;
export const MESSAGE_IMAGE_PREVIEW_HEIGHT = 640;
export const MESSAGE_IMAGE_PREVIEW_QUALITY = 72;
export const MESSAGE_IMAGE_PREVIEW_MAX_INPUT_PIXELS = 40_000_000;
export const MESSAGE_IMAGE_PREVIEW_TIMEOUT_SECONDS = 5;

type GenerateImagePreviewInput = {
  blob: Blob;
  fileName: string;
};

type GeneratedImagePreview = {
  blob: Blob;
  fileName: string;
  contentType: "image/jpeg";
  byteLength: number;
};

function buildPreviewFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return `${fileName}-preview.jpg`;
  }

  return `${fileName.slice(0, dotIndex)}-preview.jpg`;
}

export async function generateImagePreview(
  input: GenerateImagePreviewInput,
): Promise<GeneratedImagePreview | null> {
  const sourceBuffer = Buffer.from(await input.blob.arrayBuffer());
  if (sourceBuffer.length === 0 || sourceBuffer.length > MAX_SMS_ATTACHMENT_UPLOAD_BYTES) {
    return null;
  }

  let previewBuffer: Buffer;
  try {
    const image = await withTimeout(
      Jimp.fromBuffer(sourceBuffer),
      MESSAGE_IMAGE_PREVIEW_TIMEOUT_SECONDS,
    );

    const inputPixels = image.bitmap.width * image.bitmap.height;
    if (
      inputPixels === 0 ||
      inputPixels > MESSAGE_IMAGE_PREVIEW_MAX_INPUT_PIXELS
    ) {
      return null;
    }

    if (
      image.bitmap.width > MESSAGE_IMAGE_PREVIEW_WIDTH ||
      image.bitmap.height > MESSAGE_IMAGE_PREVIEW_HEIGHT
    ) {
      image.scaleToFit({
        w: MESSAGE_IMAGE_PREVIEW_WIDTH,
        h: MESSAGE_IMAGE_PREVIEW_HEIGHT,
      });
    }

    previewBuffer = await withTimeout(
      image.getBuffer(JimpMime.jpeg, { quality: MESSAGE_IMAGE_PREVIEW_QUALITY }),
      MESSAGE_IMAGE_PREVIEW_TIMEOUT_SECONDS,
    );
  } catch {
    return null;
  }

  if (previewBuffer.length === 0) {
    return null;
  }

  return {
    blob: new Blob([Uint8Array.from(previewBuffer)], { type: "image/jpeg" }),
    fileName: buildPreviewFileName(input.fileName),
    contentType: "image/jpeg",
    byteLength: previewBuffer.length,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutSeconds: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Image preview generation timed out."));
        }, timeoutSeconds * 1000);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
