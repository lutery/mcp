/**
 * Thinking Extractor Functions
 *
 * @description Independent module for thinking content extraction functions.
 * Separated to avoid circular dependencies with provider-registry.ts.
 */

import { logger } from './logger.js';

/**
 * Re-export the type for backward compatibility
 * This type is defined here to avoid importing thinking-filter.ts
 */
export interface ModelResponseEnvelope {
  content: string;
  reasoning?: string;
  thinking?: string;
  rawResponse?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Type for extracting thinking content from raw model responses
 */
export type ThinkingExtractor = (rawResponse: unknown) => ModelResponseEnvelope;

/**
 * Extracts thinking content from GLM-4.6V model responses
 */
export function extractGLMThinking(rawResponse: unknown): ModelResponseEnvelope {
  try {
    // @ts-ignore - Access response structure
    const choice = rawResponse?.choices?.[0];
    const message = choice?.message || {};

    return {
      content: message.content || '',
      reasoning: message.reasoning || message.thinking || '',
      rawResponse
    };
  } catch (error) {
    logger.warn('Failed to extract GLM thinking content', { error });
    return {
      content: '',
      rawResponse
    };
  }
}

/**
 * Extracts thinking content from OpenAI-compatible responses (SiliconFlow)
 */
export function extractOpenAIThinking(rawResponse: unknown): ModelResponseEnvelope {
  try {
    // @ts-ignore - Access response structure
    const choice = rawResponse?.choices?.[0];
    const message = choice?.message || {};

    return {
      content: message.content || '',
      reasoning: message.reasoning || '',
      rawResponse
    };
  } catch (error) {
    logger.warn('Failed to extract OpenAI thinking content', { error });
    return {
      content: '',
      rawResponse
    };
  }
}

/**
 * Extracts thinking content from Claude Messages API responses
 * Claude response format: { content: [{type: "text", text: "..."}], usage: {...} }
 */
export function extractClaudeThinking(rawResponse: unknown): ModelResponseEnvelope {
  try {
    // @ts-ignore - Access response structure
    const contentBlocks = rawResponse?.content || [];

    // 提取所有文本内容
    const textParts = contentBlocks
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => block?.text || '')
      .filter(Boolean);

    const content = textParts.join('\n\n');

    // Claude 的 extended thinking 可能返回在 thinking 字段中
    // 但大多数情况下不会单独返回，而是混在 content 中
    // stripThinking 会处理这种情况
    return {
      content,
      reasoning: (rawResponse as any)?.thinking || '',
      rawResponse
    };
  } catch (error) {
    logger.warn('Failed to extract Claude thinking content', { error });
    return {
      content: '',
      rawResponse
    };
  }
}

/**
 * Extracts thinking content from Gemini generateContent responses
 * Gemini response format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
 * Supports both official format (content.parts) and proxy format (output.parts)
 */
export function extractGeminiThinking(rawResponse: unknown): ModelResponseEnvelope {
  try {
    // @ts-ignore - Access response structure
    const candidate = rawResponse?.candidates?.[0];

    if (!candidate) {
      logger.warn('No candidates in Gemini response');
      return {
        content: '',
        rawResponse
      };
    }

    // Support two response formats:
    // Official: candidates[0].content.parts[].text
    // Proxy: candidates[0].output.parts[].text
    const parts = candidate?.content?.parts || candidate?.output?.parts || [];

    // Extract all text parts
    const textParts = parts
      .filter((part: any) => part?.text)
      .map((part: any) => part.text);

    const content = textParts.join('\n\n');

    // Map usage metadata
    const usageMetadata = (rawResponse as any)?.usageMetadata || (rawResponse as any)?.usage;
    const usage = usageMetadata ? {
      promptTokens: usageMetadata.promptTokenCount || usageMetadata.inputTokens,
      completionTokens: usageMetadata.candidatesTokenCount || usageMetadata.outputTokens,
      totalTokens: usageMetadata.totalTokens || (
        (usageMetadata.promptTokenCount || usageMetadata.inputTokens || 0) +
        (usageMetadata.candidatesTokenCount || usageMetadata.outputTokens || 0)
      )
    } : undefined;

    return {
      content,
      rawResponse,
      usage
    };
  } catch (error) {
    logger.warn('Failed to extract Gemini thinking content', { error });
    return {
      content: '',
      rawResponse
    };
  }
}
