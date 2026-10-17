<p align="center">
  <img src="assets/logo.png" alt="OpenAI Images" width="240" />
</p>

<h1 align="center">OpenAI Images</h1>

<p align="center"><em>Formerly Pythia.</em></p>

<p align="center">
  An MCP server for OpenAI's image models.<br/>
  Image generation and editing.<br/>
  <strong>Works with files on disk, not in a browser tab.</strong>
</p>

<p align="center">
  <br/>
  <a href="https://www.buymeacoffee.com/hello_emrah"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=hello_emrah&button_colour=C46B44&font_colour=ffffff&coffee_colour=ffffff&outline_colour=ffffff&font_family=Inter" alt="Buy me a coffee" height="44" /></a>
</p>

---

An MCP server for OpenAI's image models. Whatever they can make or edit, this hands back to whatever model is driving Claude Code.

If you have ever dragged the same reference image into ChatGPT five times to iterate, or copied generated assets out of a browser back into your project folder, that friction is the tax this removes. OpenAI Images reads images from your local filesystem and writes the results back to disk. No tabs, no drag-and-drop, no exported JSON to wrangle. The model does the work; your filesystem is the surface.

## Tools

| Tool | What it does | Default model |
|---|---|---|
| `generate_image` | Text to image. Writes to disk. | `gpt-image-2` |
| `edit_image` | Edits local image files by prompt. Reads from disk, writes to disk. Optional mask for inpainting (gpt-image-1). | `gpt-image-2` |

Every model default is overridable per call and via environment variable, so a new OpenAI model lands and the only thing you change is the default.

### Disk conventions

- **Inputs** for `edit_image` are absolute or `~`-relative local file paths.
- **Outputs** are written to disk. Provide `output_path` per call, or let OpenAI Images drop them in `OPENAI_IMAGE_OUTPUT_DIR` with a timestamped filename.

## Requirements

- Node.js ≥ 18
- An OpenAI API key with access to the models you intend to call

## Install

```bash
git clone https://github.com/hello-emrah/openai-images-mcp.git
cd openai-images-mcp
npm install
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

## Wire into Claude Code

Add an entry to `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "openai-images": {
      "command": "node",
      "args": ["/absolute/path/to/openai-images-mcp/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

Restart Claude Code. The tools appear under the `mcp__openai-images__*` namespace.

## Environment variables

| Variable | Required | Default |
|---|---|---|
| `OPENAI_API_KEY` | yes | — |
| `OPENAI_IMAGE_OUTPUT_DIR` | no | `~/Pictures/openai-images` |
| `OPENAI_IMAGE_MODEL` | no | `gpt-image-2` |

## Tool reference

### `generate_image`

Generates a new image from a text prompt. Defaults to `gpt-image-2`.

| Param | Type | Required | Default |
|---|---|---|---|
| `prompt` | string | yes | — |
| `output_path` | string | no | `OPENAI_IMAGE_OUTPUT_DIR/image-<timestamp>.png` |
| `size` | string | no | `1024x1024` |
| `quality` | string | no | `high` |
| `model` | string | no | env-configured |

`gpt-image-2` supports sizes from 1024 to 3840 px on each edge (multiples of 16, max aspect ratio 3:1) and quality tiers `low`, `medium`, `high`, `auto`.

### `edit_image`

Edits one or more existing images with a text prompt.

| Param | Type | Required | Default |
|---|---|---|---|
| `prompt` | string | yes | — |
| `image_paths` | string[] | yes | — |
| `mask_path` | string | no | — |
| `output_path` | string | no | `OPENAI_IMAGE_OUTPUT_DIR/edit-<timestamp>.png` |
| `size` | string | no | `1024x1024` |
| `quality` | string | no | `high` |
| `model` | string | no | env-configured |

Masks are honored only by `gpt-image-1`. `gpt-image-2` processes every input image at high fidelity automatically.

Speech, transcription, embeddings and moderation were removed in v3: images only. Gemini covers the rest, and audio is transcribed locally.

## CLI fallback

A standalone Python CLI (`image-gen.py`) is included for one-shot image generation outside the MCP server. See `IMAGE-GEN-HOWTO.md`.

## Design philosophy

The visual mark and the tool itself were built deliberately against the visual language of capitalist software design. No gradients, no neon, no glass, no drop shadows, no isometric stock illustration. Single-shade flat seals in warm earth tones, ancient-glyph silhouettes, generous whitespace. The mark could be pressed into wax or carved into stone.

This tool is built for personal use and shared openly. It is not productised, monetised, or instrumented. Use it for your own work or fork it for yours.

## License

MIT
