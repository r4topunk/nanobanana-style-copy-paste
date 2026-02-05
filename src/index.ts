import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const model = "gemini-3-pro-image-preview";
const outputDir = path.resolve("./outputs");
const finalImageSize = 1000;
const requestedImageSize = "1K";
const requestedAspectRatio = "1:1";

const basePrompt = `SPRITE SHEET (GRID) for a dress-up game.

Generate ONE PNG 1000x1000.
Background: perfectly solid chroma key green #00FF00 (every pixel exactly #00FF00), no gradient, no texture.

Layout:
- Single item centered with 12px internal padding.
- Item must be front-facing inventory icon, consistent camera and lighting.
- NO GRID. Generate only one item in the image.

Style:
Semi-realistic 3D game clothing icons, slightly gritty / worn realism (light scuffs, mild stains, frayed seams), sharp clean cutout edges.
Soft studio key light from top-left, subtle shading contained inside the image (no long shadows).
NO UI, NO text, NO logos, NO prices, NO frames, NO watermarks, NO characters, NO mannequins, NO hangers, NO scenery.

Chroma-key safety:
Avoid green hues on the item (no green accents, no green shadows).

Consistency:
Keep the same camera, lighting, and material style across the whole 12-image set.`;

const items = [
  {
    id: "01_top_flame_bowling_shirt",
    label: "black bowling shirt with red-to-yellow flame graphic rising from the hem, black buttons"
  },
  {
    id: "02_top_dirty_white_tshirt",
    label: "worn dirty-white t-shirt, slightly stretched collar"
  },
  {
    id: "03_top_plaid_flannel",
    label: "blue/red plaid flannel overshirt, open front, wrinkled"
  },
  {
    id: "04_top_worn_denim_jacket",
    label: "faded blue denim jacket, heavily worn seams"
  },
  {
    id: "05_bottom_track_pants",
    label: "dark gray track pants with white side stripes, drawstring waist"
  },
  {
    id: "06_bottom_worn_jeans",
    label: "very worn blue jeans, small knee tear, frayed hem"
  },
  {
    id: "07_bottom_khaki_cargo_shorts",
    label: "khaki cargo shorts, heavy use, large pockets"
  },
  {
    id: "08_bottom_carpenter_pants",
    label: "brown carpenter/work pants, light stains, tool pocket"
  },
  {
    id: "09_accessory_trucker_cap",
    label: "worn trucker cap black/gray, no logo"
  },
  {
    id: "10_accessory_gold_chain",
    label: "simple medium-thick gold chain necklace"
  },
  {
    id: "11_accessory_worn_sneakers",
    label: "worn white/gray sneakers, slightly dirty sole"
  },
  {
    id: "12_accessory_work_boots",
    label: "brown work boots, scuffed leather, thick sole"
  }
];

fs.mkdirSync(outputDir, { recursive: true });

const buildPrompt = (label: string) =>
  `${basePrompt}\n\nItem:\n${label}.\n\nReturn exactly one PNG image sized ${finalImageSize}x${finalImageSize}.`;

const runCommand = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const convertToPngAndResize = async (inputPath: string, outputPath: string) => {
  try {
    await runCommand("sips", ["-s", "format", "png", "-z", `${finalImageSize}`, `${finalImageSize}`, inputPath, "--out", outputPath]);
  } catch (error) {
    console.warn("sips failed; keeping original output without resize/convert.", error);
    await fs.promises.copyFile(inputPath, outputPath);
  }
};

const extensionFromMimeType = (mimeType?: string) => {
  if (!mimeType) return "png";
  const [, subtype] = mimeType.split("/");
  if (!subtype) return "png";
  return subtype.replace("jpeg", "jpg");
};

const saveFirstImage = async (
  id: string,
  parts: Array<{ inlineData?: { data?: string; mimeType?: string } }>
) => {
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error(`No image returned for ${id}`);
  }
  const extension = extensionFromMimeType(imagePart.inlineData.mimeType);
  const rawFilename = `${id}.${extension}`;
  const rawFilepath = path.join(outputDir, rawFilename);
  const finalFilepath = path.join(outputDir, `${id}.png`);
  const buffer = Buffer.from(imagePart.inlineData.data, "base64");
  await fs.promises.writeFile(rawFilepath, buffer);
  await convertToPngAndResize(rawFilepath, finalFilepath);
  if (rawFilepath !== finalFilepath) {
    await fs.promises.rm(rawFilepath, { force: true });
  }
  return finalFilepath;
};

const main = async () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY in environment.");
  }
  const ai = new GoogleGenAI({ apiKey });

  console.log(`Model: ${model}`);
  console.log(`Output dir: ${outputDir}`);

  for (const item of items) {
    const prompt = buildPrompt(item.label);
    console.log(`\nGenerating ${item.id}...`);

    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: requestedAspectRatio,
          imageSize: requestedImageSize
        }
      }
    });

    const parts = result.candidates?.[0]?.content?.parts ?? [];
    const savedPath = await saveFirstImage(item.id, parts);
    console.log(`Saved: ${savedPath}`);
  }

  console.log(`\nDone. Generated ${items.length} images.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
