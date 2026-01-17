/**
 * Image Input Normalization Utility
 *
 * @description 统一处理图片输入：支持 URL、base64(data URL) 和本地路径
 */

import { readFile } from 'fs/promises';
import { InvalidInputError, ImageLoadError, VisionMCPError } from './errors.js';
import { logger } from './logger.js';

/**
 * 图片输入类型
 */
export type ImageInputType = 'url' | 'base64' | 'local';

/**
 * 规范化后的图片输入格式（总是转换为 base64 data URL）
 */
export interface NormalizedImageInput {
  type: ImageInputType;
  originalInput: string;
  dataUrl: string; // 总是 data:image/*;base64,...
  mimeType: string;
}

/**
 * 支持的图片 MIME 类型
 * 仅支持 GLM 和 SiliconFlow 明确支持的格式（保守列表）
 * D-002: Only support image input types supported by GLM/SiliconFlow
 */
const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

/**
 * 文件扩展名到 MIME 类型的映射
 * 仅支持 GLM 和 SiliconFlow 明确支持的格式
 */
const EXT_TO_MIME_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

/**
 * 检测输入类型
 */
export function detectInputType(input: string): ImageInputType {
  // 检测 base64 data URL
  if (input.startsWith('data:image/') && input.includes(';base64,')) {
    return 'base64';
  }

  // 检测 URL（http 或 https）
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return 'url';
  }

  // 其他情况视为本地路径
  return 'local';
}

/**
 * 从文件扩展名获取 MIME 类型
 */
export function getMimeTypeFromFileName(filename: string): string {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  const mimeType = EXT_TO_MIME_TYPE[ext];

  if (!mimeType) {
    throw new InvalidInputError(
      `Unsupported file extension: ${ext}`,
      { filename, supportedExtensions: Object.keys(EXT_TO_MIME_TYPE) }
    );
  }

  return mimeType;
}

/**
 * 从 data URL 提取 MIME 类型
 */
export function getMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/i);

  if (!match) {
    throw new InvalidInputError(
      'Invalid data URL format. Expected: data:image/*;base64,...',
      { dataUrl }
    );
  }

  const mimeType = match[1].toLowerCase();

  if (!SUPPORTED_MIME_TYPES.includes(mimeType as string)) {
    throw new InvalidInputError(
      `Unsupported image MIME type: ${mimeType}`,
      { supportedTypes: SUPPORTED_MIME_TYPES }
    );
  }

  return mimeType;
}

/**
 * 检测 URL 是否指向图片文件
 */
export function isImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();

    return Object.keys(EXT_TO_MIME_TYPE).some(ext =>
      pathname.endsWith(ext)
    );
  } catch {
    // 无效的 URL
    return false;
  }
}

/**
 * 规范化图片输入为统一的 data URL 格式
 */
export async function normalizeImageInput(input: string): Promise<NormalizedImageInput> {
  const type = detectInputType(input);
  // 默认启用严格 URL 验证（符合 D-002），可通过 VISION_STRICT_URL_VALIDATION=false 禁用
  const strictValidation = process.env.VISION_STRICT_URL_VALIDATION !== 'false';

  logger.debug('Normalizing image input', {
    type,
    inputLength: input.length,
    strictValidation
  });

  try {
    switch (type) {
      case 'base64':
        return await normalizeBase64Input(input);

      case 'url':
        return await normalizeUrlInput(input, strictValidation);

      case 'local':
        return await normalizeLocalInput(input);

      default:
        throw new InvalidInputError(
          `Unsupported input type: ${type}`,
          { input, detectedType: type }
        );
    }
  } catch (error) {
    if (error instanceof VisionMCPError) {
      throw error;
    }

    throw new ImageLoadError(
      `Failed to normalize image input`,
      { input, type },
      error
    );
  }
}

/**
 * 规范化 base64 data URL 输入
 */
async function normalizeBase64Input(input: string): Promise<NormalizedImageInput> {
  try {
    // 验证格式
    if (!input.includes(',') || input.split(',').length !== 2) {
      throw new InvalidInputError(
        'Invalid data URL format. Expected: data:image/*;base64,DATA'
      );
    }

    const mimeType = getMimeTypeFromDataUrl(input);
    const dataPart = input.split(',')[1];

    // 验证 base64 数据
    if (!dataPart || dataPart.length === 0) {
      throw new InvalidInputError(
        'No base64 data found in data URL'
      );
    }

    logger.debug('Base64 input validated', { mimeType, dataLength: dataPart.length });

    return {
      type: 'base64',
      originalInput: input,
      dataUrl: input,
      mimeType
    };
  } catch (error) {
    throw new ImageLoadError(
      'Invalid base64 data URL',
      { input },
      error
    );
  }
}

/**
 * 规范化 URL 输入
 *
 * @description 当前直接返回 URL，实际场景中可以下载并转换为 base64
 */
async function normalizeUrlInput(input: string, strictValidation: boolean): Promise<NormalizedImageInput> {
  try {
    // 验证 URL 格式
    const url = new URL(input);

    if (!url.protocol.startsWith('http')) {
      throw new InvalidInputError(
        'Only HTTP/HTTPS URLs are supported',
        { protocol: url.protocol }
      );
    }

    // 检测是否为图片 URL
    if (!isImageUrl(input)) {
      if (strictValidation) {
        throw new InvalidInputError(
          `URL does not have a supported image extension (allowed: ${Object.keys(EXT_TO_MIME_TYPE).join(', ')})`,
          { url: input }
        );
      } else {
        logger.warn('URL does not appear to point to an image file', { url: input });
        logger.warn('Set VISION_STRICT_URL_VALIDATION=true to enforce strict validation', { url: input });
      }
    }

    logger.debug('URL input validated', { url: input, strictValidation });

    // 注意：SiliconFlow 和 GLM 都直接支持 URL
    // 这里我们保持为 URL 格式，适配器会处理
    return {
      type: 'url',
      originalInput: input,
      dataUrl: input, // 保持为 URL
      mimeType: 'image/*' // 实际类型由模型确定
    };
  } catch (error) {
    if (error instanceof TypeError) {
      throw new InvalidInputError(
        'Invalid URL format',
        { input },
        error
      );
    }

    throw new ImageLoadError(
      'Failed to process URL input',
      { input },
      error
    );
  }
}

/**
 * 规范化本地文件路径输入
 *
 * @description 读取本地文件并转换为 base64 data URL
 */
async function normalizeLocalInput(input: string): Promise<NormalizedImageInput> {
  try {
    logger.debug('Reading local file', { path: input });

    // 读取文件
    const fileBuffer = await readFile(input);

    if (fileBuffer.length === 0) {
      throw new ImageLoadError(
        'File is empty',
        { path: input }
      );
    }

    // 检测 MIME 类型
    const mimeType = getMimeTypeFromFileName(input);

    // 转换为 base64
    const base64Data = fileBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    logger.debug('Local file converted to base64', {
      path: input,
      mimeType,
      size: fileBuffer.length,
      dataUrlLength: dataUrl.length
    });

    return {
      type: 'local',
      originalInput: input,
      dataUrl,
      mimeType
    };
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new ImageLoadError(
        'File not found',
        { path: input },
        error
      );
    }

    if ((error as any).code === 'EACCES') {
      throw new ImageLoadError(
        'Permission denied reading file',
        { path: input },
        error
      );
    }

    throw new ImageLoadError(
      'Failed to read local file',
      { path: input },
      error
    );
  }
}

/**
 * 获取图片大小信息（用于日志）
 */
export function getImageSizeInfo(dataUrl: string): { size: number } {
  try {
    const base64Data = dataUrl.includes(',')
      ? dataUrl.split(',')[1]
      : dataUrl;

    // 计算大小（base64 编码的原始数据）
    const decodedSize = Math.floor(base64Data.length * 0.75);

    return { size: decodedSize };
  } catch {
    return { size: 0 };
  }
}
