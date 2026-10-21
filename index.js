#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve, extname } from 'path';
import { homedir } from 'os';

// ─── Config ───────────────────────────────────────────────────────────────────

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('ERROR: OPENAI_API_KEY env var is not set.');
  process.exit(1);
}

const IMAGE_DIR     = process.env.OPENAI_IMAGE_OUTPUT_DIR || `${homedir()}/Pictures/openai-images`;
const IMAGE_MODEL   = process.env.OPENAI_IMAGE_MODEL      || 'gpt-image-2';

const IMAGE_SIZES     = ['1024x1024', '1024x1536', '1536x1024', '2048x2048', '2048x1152', '1152x2048', 'auto'];
const IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'];
const BACKGROUNDS     = ['transparent', 'opaque', 'auto'];
const OUTPUT_FORMATS  = ['png', 'webp', 'jpeg'];
const FIDELITIES      = ['high', 'low'];

const openai = new OpenAI({ apiKey });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expandPath(p) {
  if (!p) return p;
  if (p.startsWith('~')) p = p.replace(/^~/, homedir());
  return resolve(p);
}

function resolveOutputPath(output_path, root, fallbackName, defaultExt) {
  if (output_path) return expandPath(output_path);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(root, `${fallbackName}-${stamp}.${defaultExt}`);
}

// Optional API settings shared by generate and edit. Transparency needs png or webp.
function extraParams({ background, output_format, input_fidelity }, { allowFidelity = false } = {}) {
  const extra = {};
  if (background) {
    if (!BACKGROUNDS.includes(background)) throw new Error(`Invalid background "${background}". Choose: ${BACKGROUNDS.join(', ')}`);
    extra.background = background;
  }
  if (output_format) {
    if (!OUTPUT_FORMATS.includes(output_format)) throw new Error(`Invalid output_format "${output_format}". Choose: ${OUTPUT_FORMATS.join(', ')}`);
    extra.output_format = output_format;
  }
  if (background === 'transparent' && output_format === 'jpeg') throw new Error('A transparent background needs output_format png or webp.');
  if (input_fidelity) {
    if (!allowFidelity) throw new Error('input_fidelity only applies to edit_image.');
    if (!FIDELITIES.includes(input_fidelity)) throw new Error(`Invalid input_fidelity "${input_fidelity}". Choose: ${FIDELITIES.join(', ')}`);
    extra.input_fidelity = input_fidelity;
  }
  return extra;
}

function mimeFor(path) {
  const ext = extname(path).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
}

function writeBinary(outputPath, buffer, validExts) {
  const ext = extname(outputPath).toLowerCase();
  if (validExts && !validExts.includes(ext)) {
    throw new Error(`Output file extension must be one of: ${validExts.join(', ')}. Got: ${ext || '(none)'}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
  return { path: outputPath, size_kb: Math.round(buffer.length / 1024) };
}

// ─── Image: generate ──────────────────────────────────────────────────────────

async function generateImage({ prompt, output_path, size = '1024x1024', quality = 'high', model = IMAGE_MODEL, background, output_format }) {
  if (!prompt) throw new Error('prompt is required.');
  if (size && !IMAGE_SIZES.includes(size) && size !== 'auto') {
    throw new Error(`Invalid size "${size}". Common values: ${IMAGE_SIZES.join(', ')}`);
  }
  if (quality && !IMAGE_QUALITIES.includes(quality)) {
    throw new Error(`Invalid quality "${quality}". Choose: ${IMAGE_QUALITIES.join(', ')}`);
  }

  const extra = extraParams({ background, output_format });
  const out = resolveOutputPath(output_path, IMAGE_DIR, 'image', output_format || 'png');
  const result = await openai.images.generate({ model, prompt, size, quality, n: 1, ...extra });
  const b64 = result.data[0].b64_json;
  if (!b64) throw new Error('No image data returned from OpenAI.');
  const file = writeBinary(out, Buffer.from(b64, 'base64'), ['.png', '.jpg', '.jpeg', '.webp']);

  return { model, size, quality, ...extra, prompt_preview: prompt.slice(0, 200), output: file };
}

// ─── Image: edit ──────────────────────────────────────────────────────────────

async function editImage({ prompt, image_paths, mask_path, output_path, size = '1024x1024', quality = 'high', model = IMAGE_MODEL, background, output_format, input_fidelity }) {
  if (!prompt) throw new Error('prompt is required.');
  if (!image_paths || !image_paths.length) throw new Error('image_paths is required (array of file paths).');

  const extra = extraParams({ background, output_format, input_fidelity }, { allowFidelity: true });
  const out = resolveOutputPath(output_path, IMAGE_DIR, 'edit', output_format || 'png');

  const { toFile } = await import('openai/uploads');
  const images = await Promise.all(image_paths.map(async (p) => {
    const abs = expandPath(p);
    const buf = readFileSync(abs);
    return toFile(buf, abs.split('/').pop(), { type: mimeFor(abs) });
  }));

  const params = {
    model, prompt, n: 1, size, quality,
    image: images.length === 1 ? images[0] : images,
    ...extra,
  };
  if (mask_path) {
    const maskAbs = expandPath(mask_path);
    params.mask = await toFile(readFileSync(maskAbs), maskAbs.split('/').pop(), { type: 'image/png' });
  }

  const result = await openai.images.edit(params);
  const b64 = result.data[0].b64_json;
  if (!b64) throw new Error('No image data returned from OpenAI.');
  const file = writeBinary(out, Buffer.from(b64, 'base64'), ['.png', '.jpg', '.jpeg', '.webp']);

  return { model, size, quality, ...extra, prompt_preview: prompt.slice(0, 200), inputs: image_paths, mask: mask_path || null, output: file };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate a new image from a text prompt. Defaults to gpt-image-2 (configurable via OPENAI_IMAGE_MODEL).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt:      { type: 'string', description: 'Text prompt describing the image.' },
        output_path: { type: 'string', description: 'Absolute or ~-relative output path. Defaults to OPENAI_IMAGE_OUTPUT_DIR.' },
        size:        { type: 'string', description: 'Image size. Default: 1024x1024.' },
        quality:     { type: 'string', enum: IMAGE_QUALITIES, description: 'Render quality. Default: high.' },
        model:       { type: 'string', description: 'Model override (e.g. gpt-image-1, gpt-image-2). Default: env-configured.' },
        background:    { type: 'string', enum: BACKGROUNDS, description: 'transparent for a cutout with real alpha (needs png or webp), opaque, or auto. Default: model decides.' },
        output_format: { type: 'string', enum: OUTPUT_FORMATS, description: 'File format returned by the API. Default: png.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'edit_image',
    description: 'Edit one or more existing images with a text prompt. Supports an optional mask for inpainting (gpt-image-1 only).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt:      { type: 'string', description: 'Text prompt describing the edit.' },
        image_paths: { type: 'array', items: { type: 'string' }, description: 'One or more input image file paths.' },
        mask_path:   { type: 'string', description: 'Optional mask image path. gpt-image-1 only; gpt-image-2 ignores masks.' },
        output_path: { type: 'string', description: 'Absolute or ~-relative output path.' },
        size:        { type: 'string', description: 'Image size. Default: 1024x1024.' },
        quality:     { type: 'string', enum: IMAGE_QUALITIES, description: 'Render quality. Default: high.' },
        model:       { type: 'string', description: 'Model override. Default: env-configured.' },
        background:     { type: 'string', enum: BACKGROUNDS, description: 'transparent to remove the background with real alpha (needs png or webp), opaque, or auto. Default: model decides.' },
        output_format:  { type: 'string', enum: OUTPUT_FORMATS, description: 'File format returned by the API. Default: png.' },
        input_fidelity: { type: 'string', enum: FIDELITIES, description: 'high keeps the input image\'s details, faces and textures closer to the original. Default: low.' },
      },
      required: ['prompt', 'image_paths'],
    },
  },
];

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'openai-images', version: '3.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result;
    switch (name) {
      case 'generate_image': result = await generateImage(args); break;
      case 'edit_image':     result = await editImage(args); break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
