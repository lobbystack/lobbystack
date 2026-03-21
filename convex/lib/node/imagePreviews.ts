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

  const image = await Jimp.fromBuffer(sourceBuffer);
  if (image.bitmap.width * image.bitmap.height > MESSAGE_IMAGE_PREVIEW_MAX_INPUT_PIXELS) {
    return null;
  }

  image.scaleToFit({
    w: MESSAGE_IMAGE_PREVIEW_WIDTH,
    h: MESSAGE_IMAGE_PREVIEW_HEIGHT,
  });

  const previewBuffer = await image.getBuffer(JimpMime.jpeg, {
    quality: MESSAGE_IMAGE_PREVIEW_QUALITY,
  });

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
