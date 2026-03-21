"use node";

import sharp from "sharp";

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
    previewBuffer = await sharp(sourceBuffer, {
      failOn: "error",
      limitInputPixels: MESSAGE_IMAGE_PREVIEW_MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: MESSAGE_IMAGE_PREVIEW_WIDTH,
        height: MESSAGE_IMAGE_PREVIEW_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: MESSAGE_IMAGE_PREVIEW_QUALITY,
        mozjpeg: true,
      })
      .timeout({ seconds: MESSAGE_IMAGE_PREVIEW_TIMEOUT_SECONDS })
      .toBuffer();
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
