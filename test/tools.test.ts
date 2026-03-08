import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @quiverai/sdk module before importing anything that uses it
const mockListModels = vi.fn();

vi.mock("@quiverai/sdk", () => {
  return {
    QuiverAI: class MockQuiverAI {
      _opts: unknown;
      models = { listModels: mockListModels };
      constructor(opts: unknown) {
        this._opts = opts;
      }
    },
  };
});

import { QuiverAI } from "@quiverai/sdk";
import { createQuiverClient, handleListModels, formatError } from "../src/index.js";

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
