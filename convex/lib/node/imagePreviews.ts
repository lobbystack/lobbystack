"use node";

import { Jimp, JimpMime } from "jimp";

export const MESSAGE_IMAGE_PREVIEW_WIDTH = 640;
export const MESSAGE_IMAGE_PREVIEW_HEIGHT = 640;
export const MESSAGE_IMAGE_PREVIEW_QUALITY = 72;

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
  if (sourceBuffer.length === 0) {
    return null;
  }

  const image = await Jimp.fromBuffer(sourceBuffer);
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
