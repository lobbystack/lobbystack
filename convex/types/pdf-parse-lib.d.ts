declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParseResult = {
    text: string;
  };

  export default function pdf(dataBuffer: Buffer): Promise<PdfParseResult>;
}
