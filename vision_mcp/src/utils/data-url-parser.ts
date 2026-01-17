/**
 * Data URL Parser Utility
 *
 * @description 解析 data URL 格式，将 data:image/png;base64,... 拆解为 mimeType 和 base64 data
 * 用于 Claude API 适配器，因为 Claude 需要单独的 media_type 和 base64 data 字段
 */

/**
 * 解析后的 data URL 结构
 */
export interface ParsedDataUrl {
  mimeType: string;
  data: string;
}

/**
 * 解析 data URL
 * @param dataUrl - data:image/png;base64,iVBORw0KG...
 * @returns { mimeType, data }
 * @throws {Error} 如果 data URL 格式无效
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL: must start with "data:"');
  }

  // 格式：data:image/png;base64,iVBORw0KG...
  // 或：data:image/png;charset=utf-8;base64,iVBORw0KG...（带 charset）
  const commaIndex = dataUrl.indexOf(',');

  if (commaIndex === -1) {
    throw new Error('Invalid data URL: missing comma separator');
  }

  const metaPart = dataUrl.substring(5, commaIndex); // "data:" 之后，"," 之前
  const dataPart = dataUrl.substring(commaIndex + 1);

  // 新增：验证 dataPart 非空
  if (!dataPart) {
    throw new Error('Invalid data URL: empty data part');
  }

  // 解析 meta 部分：image/png;base64 或 image/png;charset=utf-8;base64
  const metaParts = metaPart.split(';');
  const mimeType = metaParts[0];

  if (!mimeType?.startsWith('image/')) {
    throw new Error(`Invalid MIME type in data URL: ${mimeType}`);
  }

  // 修复：使用 includes 查找 base64，而不是假设 position [1]
  // 这样可以处理带 charset 的 data URL，如：data:image/png;charset=utf-8;base64,...
  if (!metaParts.includes('base64')) {
    throw new Error('Invalid data URL: missing base64 encoding');
  }

  return {
    mimeType,
    data: dataPart
  };
}

/**
 * 检查是否为 data URL
 * @param value - 待检查的字符串
 * @returns 是否为 data URL
 */
export function isDataUrl(value: string): boolean {
  return value.startsWith('data:image/');
}
