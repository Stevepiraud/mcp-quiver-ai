# mcp-quiver-ai

MCP server for [Quiver AI](https://quiver.ai) — generate and vectorize SVGs from Claude Code.

## Install

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "quiver-ai": {
      "command": "npx",
      "args": ["mcp-quiver-ai"],
      "env": { "QUIVERAI_API_KEY": "your-api-key" }
    }
  }
}
```

## Tools

### quiver_generate_svg

Generate SVG vector graphics from a text prompt.

| Parameter | Required | Description |
|-----------|----------|-------------|
| prompt | Yes | Description of the SVG to generate |
| output_path | No | File path to save (default: public/assets/\<auto\>.svg) |
| instructions | No | Style/formatting guidance |
| references | No | Up to 4 reference image URLs or local paths |
| n | No | Number of variations (1-16, default: 1) |
| temperature | No | Sampling temperature (0-2, default: 1) |

### quiver_vectorize_image

Convert a raster image (PNG, JPEG, WebP) into an editable SVG.

| Parameter | Required | Description |
|-----------|----------|-------------|
| image | Yes | Image URL or local file path |
| output_path | No | File path to save (default: public/assets/\<auto\>.svg) |
| auto_crop | No | Crop to dominant subject (default: false) |
| target_size | No | Resize to square pixels (128-4096) |
| n | No | Number of variations (1-16, default: 1) |

### quiver_list_models

List available Quiver AI models. No parameters.

## API Key

Get your key at [app.quiver.ai](https://app.quiver.ai) (Settings > Developers > API Keys).

## License

MIT
