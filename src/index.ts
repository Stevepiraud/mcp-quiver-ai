import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QuiverAI } from "@quiverai/sdk";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

export function createQuiverClient(apiKey?: string): QuiverAI {
  const key = apiKey ?? process.env.QUIVERAI_API_KEY;
  if (!key) {
    throw new Error(
      "No API key provided. Set QUIVERAI_API_KEY environment variable or pass apiKey option."
    );
  }
  return new QuiverAI({ bearerAuth: key });
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    switch (statusCode) {
      case 401:
        return "Invalid or missing API key. Check QUIVERAI_API_KEY.";
      case 402:
        return "Insufficient credits. Top up at https://app.quiver.ai";
      case 429:
        return "Rate limited (20 requests/60s). Wait and try again.";
      default:
        return `Quiver AI error: ${error.message}`;
    }
  }
  return `Quiver AI error: ${String(error)}`;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function handleListModels(client: QuiverAI) {
  try {
    const response = await client.models.listModels();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatError(error),
        },
      ],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Generate SVG handler
// ---------------------------------------------------------------------------

interface GenerateSvgInput {
  prompt: string;
  output_path: string;
  instructions?: string;
  references?: string[];
  n?: number;
  temperature?: number;
}

export async function handleGenerateSvg(client: QuiverAI, input: GenerateSvgInput) {
  try {
    const references = input.references?.map((ref) => {
      if (ref.startsWith("http://") || ref.startsWith("https://")) {
        return { url: ref };
      }
      const fileData = fs.readFileSync(ref);
      return { base64: fileData.toString("base64") };
    });

    const response = await client.createSVGs.generateSVG({
      model: "arrow-preview",
      prompt: input.prompt,
      instructions: input.instructions,
      references,
      n: input.n ?? 1,
      temperature: input.temperature ?? 1,
      stream: false,
    });

    // The SDK returns a union type: SvgResponse | PublicErrorEnvelope | Stream
    // Check for error envelope before accessing .data
    const resp = response as Record<string, unknown>;
    if ("code" in resp && "message" in resp) {
      throw new Error(`API error [${resp.code}]: ${resp.message}`);
    }

    const svgResponse = response as {
      id: string;
      created: number;
      data: Array<{ mimeType: string; svg: string }>;
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    };

    if (!svgResponse.data) {
      throw new Error(`Unexpected API response: ${JSON.stringify(response)}`);
    }

    const dir = path.dirname(input.output_path);
    fs.mkdirSync(dir, { recursive: true });

    const savedPaths: string[] = [];

    if (svgResponse.data.length === 1) {
      fs.writeFileSync(input.output_path, svgResponse.data[0].svg, "utf-8");
      savedPaths.push(input.output_path);
    } else {
      const ext = path.extname(input.output_path);
      const base = input.output_path.slice(0, -ext.length);
      for (let i = 0; i < svgResponse.data.length; i++) {
        const filePath = `${base}-${i + 1}${ext}`;
        fs.writeFileSync(filePath, svgResponse.data[i].svg, "utf-8");
        savedPaths.push(filePath);
      }
    }

    const summary = {
      savedFiles: savedPaths,
      usage: svgResponse.usage,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatError(error),
        },
      ],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Vectorize Image handler
// ---------------------------------------------------------------------------

interface VectorizeImageInput {
  image: string;
  output_path: string;
  auto_crop?: boolean;
  target_size?: number;
  n?: number;
}

export async function handleVectorizeImage(client: QuiverAI, input: VectorizeImageInput) {
  try {
    let image: { url: string } | { base64: string };

    if (input.image.startsWith("http://") || input.image.startsWith("https://")) {
      image = { url: input.image };
    } else {
      const fileData = fs.readFileSync(input.image);
      image = { base64: fileData.toString("base64") };
    }

    const response = await client.vectorizeSVG.vectorizeSVG({
      model: "arrow-preview",
      image,
      autoCrop: input.auto_crop,
      targetSize: input.target_size,
      n: input.n ?? 1,
      stream: false,
    });

    // The SDK returns a union type: SvgResponse | PublicErrorEnvelope | Stream
    // Check for error envelope before accessing .data
    const resp = response as Record<string, unknown>;
    if ("code" in resp && "message" in resp) {
      throw new Error(`API error [${resp.code}]: ${resp.message}`);
    }

    const svgResponse = response as {
      id: string;
      created: number;
      data: Array<{ mimeType: string; svg: string }>;
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    };

    if (!svgResponse.data) {
      throw new Error(`Unexpected API response: ${JSON.stringify(response)}`);
    }

    const dir = path.dirname(input.output_path);
    fs.mkdirSync(dir, { recursive: true });

    const savedPaths: string[] = [];

    if (svgResponse.data.length === 1) {
      fs.writeFileSync(input.output_path, svgResponse.data[0].svg, "utf-8");
      savedPaths.push(input.output_path);
    } else {
      const ext = path.extname(input.output_path);
      const base = input.output_path.slice(0, -ext.length);
      for (let i = 0; i < svgResponse.data.length; i++) {
        const filePath = `${base}-${i + 1}${ext}`;
        fs.writeFileSync(filePath, svgResponse.data[i].svg, "utf-8");
        savedPaths.push(filePath);
      }
    }

    const summary = {
      savedFiles: savedPaths,
      usage: svgResponse.usage,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatError(error),
        },
      ],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

async function main() {
  const client = createQuiverClient();

  const server = new McpServer(
    { name: "mcp-quiver-ai", version: "0.1.0" },
  );

  server.tool(
    "quiver_list_models",
    "List all models available via Quiver AI, including supported operations and pricing.",
    async () => handleListModels(client),
  );

  server.tool(
    "quiver_generate_svg",
    "Generate SVG vector graphics from a text prompt using Quiver AI.",
    {
      prompt: z.string().describe("Description of the SVG to generate"),
      output_path: z.string().optional().describe("File path to save the SVG (default: public/assets/<auto>.svg)"),
      instructions: z.string().optional().describe("Style/formatting guidance"),
      references: z.array(z.string()).optional().describe("Up to 4 reference image URLs or local file paths"),
      n: z.number().min(1).max(16).optional().describe("Number of variations (default: 1)"),
      temperature: z.number().min(0).max(2).optional().describe("Sampling temperature (default: 1)"),
    },
    async (args) => {
      const outputPath = args.output_path ?? `public/assets/${args.prompt.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`;
      return handleGenerateSvg(client, { ...args, output_path: outputPath });
    },
  );

  server.tool(
    "quiver_vectorize_image",
    "Convert a raster image (PNG, JPEG, WebP) into an editable SVG using Quiver AI.",
    {
      image: z.string().describe("Image URL or local file path to vectorize"),
      output_path: z.string().optional().describe("File path to save the SVG (default: public/assets/<auto>.svg)"),
      auto_crop: z.boolean().optional().describe("Crop to dominant subject before vectorization (default: false)"),
      target_size: z.number().min(128).max(4096).optional().describe("Resize to square pixels before inference (128-4096)"),
      n: z.number().min(1).max(16).optional().describe("Number of variations (default: 1)"),
    },
    async (args) => {
      const outputPath = args.output_path ?? `public/assets/${path.basename(args.image, path.extname(args.image))}.svg`;
      return handleVectorizeImage(client, { ...args, output_path: outputPath });
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run main() when executed directly, not when imported in tests
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
   import.meta.url === new URL(`file://${process.argv[1]}`).href);

if (isDirectExecution) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
