import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock the @quiverai/sdk module before importing anything that uses it
const mockListModels = vi.fn();
const mockGenerateSVG = vi.fn();

vi.mock("@quiverai/sdk", () => {
  return {
    QuiverAI: class MockQuiverAI {
      _opts: unknown;
      models = { listModels: mockListModels };
      createSVGs = { generateSVG: mockGenerateSVG };
      constructor(opts: unknown) {
        this._opts = opts;
      }
    },
  };
});

import { QuiverAI } from "@quiverai/sdk";
import { createQuiverClient, handleListModels, handleGenerateSvg, formatError } from "../src/index.js";

describe("createQuiverClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a client with the provided API key", () => {
    const client = createQuiverClient("test-api-key");
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(QuiverAI);
    expect((client as unknown as { _opts: unknown })._opts).toEqual({
      bearerAuth: "test-api-key",
    });
  });

  it("falls back to QUIVERAI_API_KEY env var", () => {
    const original = process.env.QUIVERAI_API_KEY;
    process.env.QUIVERAI_API_KEY = "env-api-key";
    try {
      const client = createQuiverClient();
      expect(client).toBeDefined();
      expect((client as unknown as { _opts: unknown })._opts).toEqual({
        bearerAuth: "env-api-key",
      });
    } finally {
      if (original === undefined) {
        delete process.env.QUIVERAI_API_KEY;
      } else {
        process.env.QUIVERAI_API_KEY = original;
      }
    }
  });

  it("throws if no API key is found", () => {
    const original = process.env.QUIVERAI_API_KEY;
    delete process.env.QUIVERAI_API_KEY;
    try {
      expect(() => createQuiverClient()).toThrow(
        "No API key provided. Set QUIVERAI_API_KEY environment variable or pass apiKey option."
      );
    } finally {
      if (original !== undefined) {
        process.env.QUIVERAI_API_KEY = original;
      }
    }
  });
});

describe("formatError", () => {
  it("formats 401 errors", () => {
    const error = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const result = formatError(error);
    expect(result).toBe("Invalid or missing API key. Check QUIVERAI_API_KEY.");
  });

  it("formats 402 errors", () => {
    const error = Object.assign(new Error("Payment Required"), { statusCode: 402 });
    const result = formatError(error);
    expect(result).toBe("Insufficient credits. Top up at https://app.quiver.ai");
  });

  it("formats 429 errors", () => {
    const error = Object.assign(new Error("Too Many Requests"), { statusCode: 429 });
    const result = formatError(error);
    expect(result).toBe("Rate limited (20 requests/60s). Wait and try again.");
  });

  it("formats unknown errors with their message", () => {
    const error = new Error("Something went wrong");
    const result = formatError(error);
    expect(result).toBe("Quiver AI error: Something went wrong");
  });

  it("formats non-Error values", () => {
    const result = formatError("string error");
    expect(result).toBe("Quiver AI error: string error");
  });
});

describe("handleListModels", () => {
  let mockClient: ReturnType<typeof createQuiverClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createQuiverClient("test-key");
  });

  it("returns available models as formatted JSON", async () => {
    const mockModels = {
      data: [
        {
          id: "quiver-1",
          name: "Quiver 1",
          object: "model" as const,
          created: 1700000000,
          ownedBy: "quiver",
          supportedOperations: ["svg_generate"],
        },
        {
          id: "quiver-2",
          name: "Quiver 2",
          object: "model" as const,
          created: 1700000001,
          ownedBy: "quiver",
          supportedOperations: ["svg_vectorize"],
        },
      ],
      object: "list" as const,
    };

    mockListModels.mockResolvedValue(mockModels);

    const result = await handleListModels(mockClient);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(mockModels, null, 2),
        },
      ],
    });
  });

  it("handles API errors gracefully", async () => {
    const error = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    mockListModels.mockRejectedValue(error);

    const result = await handleListModels(mockClient);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Invalid or missing API key. Check QUIVERAI_API_KEY.",
        },
      ],
      isError: true,
    });
  });

  it("handles 402 errors gracefully", async () => {
    const error = Object.assign(new Error("Payment Required"), { statusCode: 402 });
    mockListModels.mockRejectedValue(error);

    const result = await handleListModels(mockClient);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Insufficient credits. Top up at https://app.quiver.ai",
        },
      ],
      isError: true,
    });
  });

  it("handles 429 rate limit errors gracefully", async () => {
    const error = Object.assign(new Error("Too Many Requests"), { statusCode: 429 });
    mockListModels.mockRejectedValue(error);

    const result = await handleListModels(mockClient);

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Rate limited (20 requests/60s). Wait and try again.",
        },
      ],
      isError: true,
    });
  });
});

describe("handleGenerateSvg", () => {
  let mockClient: ReturnType<typeof createQuiverClient>;
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createQuiverClient("test-key");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quiver-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates SVG and saves to output_path", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
    mockGenerateSVG.mockResolvedValue({
      id: "gen-123",
      created: 1700000000,
      data: [{ mimeType: "image/svg+xml", svg: svgContent }],
      usage: { inputTokens: 10, outputTokens: 50, totalTokens: 60 },
    });

    const outputPath = path.join(tmpDir, "output.svg");
    const result = await handleGenerateSvg(mockClient, {
      prompt: "a red circle",
      output_path: outputPath,
    });

    // File should exist with the SVG content
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, "utf-8")).toBe(svgContent);

    // Result should contain file path and usage info
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain(outputPath);
    expect(result.content[0].text).toContain("totalTokens");
  });

  it("generates multiple SVGs when n > 1", async () => {
    const svg1 = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
    const svg2 = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    mockGenerateSVG.mockResolvedValue({
      id: "gen-456",
      created: 1700000000,
      data: [
        { mimeType: "image/svg+xml", svg: svg1 },
        { mimeType: "image/svg+xml", svg: svg2 },
      ],
      usage: { inputTokens: 10, outputTokens: 100, totalTokens: 110 },
    });

    const outputPath = path.join(tmpDir, "multi.svg");
    const result = await handleGenerateSvg(mockClient, {
      prompt: "shapes",
      output_path: outputPath,
      n: 2,
    });

    // Multiple files: {base}-1.svg and {base}-2.svg
    const file1 = path.join(tmpDir, "multi-1.svg");
    const file2 = path.join(tmpDir, "multi-2.svg");
    expect(fs.existsSync(file1)).toBe(true);
    expect(fs.existsSync(file2)).toBe(true);
    expect(fs.readFileSync(file1, "utf-8")).toBe(svg1);
    expect(fs.readFileSync(file2, "utf-8")).toBe(svg2);

    // Result should reference both files
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(file1);
    expect(result.content[0].text).toContain(file2);
  });

  it("passes instructions and references to the API", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    mockGenerateSVG.mockResolvedValue({
      id: "gen-789",
      created: 1700000000,
      data: [{ mimeType: "image/svg+xml", svg: svgContent }],
      usage: { inputTokens: 20, outputTokens: 60, totalTokens: 80 },
    });

    const outputPath = path.join(tmpDir, "ref-test.svg");
    await handleGenerateSvg(mockClient, {
      prompt: "an icon",
      output_path: outputPath,
      instructions: "flat design, monochrome",
      references: ["https://example.com/ref.png", "http://example.com/ref2.jpg"],
    });

    // Verify the mock was called with the correct parameters
    expect(mockGenerateSVG).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateSVG.mock.calls[0][0];
    expect(callArgs.model).toBe("arrow-preview");
    expect(callArgs.prompt).toBe("an icon");
    expect(callArgs.instructions).toBe("flat design, monochrome");
    expect(callArgs.stream).toBe(false);
    expect(callArgs.references).toEqual([
      { url: "https://example.com/ref.png" },
      { url: "http://example.com/ref2.jpg" },
    ]);
  });

  it("handles API errors gracefully", async () => {
    const error = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    mockGenerateSVG.mockRejectedValue(error);

    const outputPath = path.join(tmpDir, "error.svg");
    const result = await handleGenerateSvg(mockClient, {
      prompt: "will fail",
      output_path: outputPath,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Invalid or missing API key. Check QUIVERAI_API_KEY."
    );
    // No file should be created
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
