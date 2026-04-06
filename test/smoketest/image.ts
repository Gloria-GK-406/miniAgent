import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let imageBase64: string | undefined;

export function getTestImageBase64(): string {
  if (!imageBase64) {
    const imgPath = resolve(import.meta.dirname, "image.png");
    const buf = readFileSync(imgPath);
    imageBase64 = buf.toString("base64");
  }
  return imageBase64;
}
