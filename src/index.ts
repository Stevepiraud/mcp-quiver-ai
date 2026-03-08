import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QuiverAI } from "@quiverai/sdk";

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
