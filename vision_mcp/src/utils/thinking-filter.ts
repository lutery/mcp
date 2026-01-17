/**
 * Thinking/Reasoning Content Filter
 *
 * @description Filters thinking/reasoning content from model responses to prevent
 * exposing internal reasoning to MCP clients. Supports multiple models and response formats.
 *
 * Architecture Decision: Keep thinking enabled at model level but strip reasoning
 * content before returning to MCP client.
 */

import { logger } from './logger.js';
import {
  ModelResponseEnvelope,
  ThinkingExtractor,
  extractGLMThinking,
  extractOpenAIThinking,
  extractClaudeThinking,
  extractGeminiThinking
} from './thinking-extractors.js';

// Re-export for backward compatibility
export type { ModelResponseEnvelope, ThinkingExtractor };

/**
 * Thinking content patterns to filter from text
 * These patterns match common thinking/reasoning content markers used by various models
 */
const THINKING_PATTERNS = [
  // HTML-style thinking tags
  /<thinking>[\s\S]*?<\/thinking>/gi,
  // Analysis tags
  /<<analysis>>[\s\S]*?<<analysis>>/gi,
  // Reasoning patterns (match from Reasoning:/Thoughts:/Analysis: to end of line)
  /^\s*(Reasoning|Thoughts|Analysis):.*$/gim,
  // Markdown thinking sections
  /```(?:thinking|reasoning)[\s\S]*?```/gi,
  // Inline thinking markers
  /\[thinking\][\s\S]*?\[\/thinking\]/gi,
  // Match leftover thinking markers to ensure they don't appear
  /(<thinking>|<\/thinking>|<<analysis>>)/gi,
  // Optional: Add more patterns as new models are discovered
];

/**
 * Registry of thinking extractors by model type
 * Uses imported extractor functions to avoid circular dependencies
 */
export const THINKING_EXTRACTORS: Record<string, ThinkingExtractor> = {
  'glm': extractGLMThinking,
  'glm-4.6v': extractGLMThinking,
  'glm-4v': extractGLMThinking,
  'siliconflow': extractOpenAIThinking,
  'openai': extractOpenAIThinking,
  'claude': extractClaudeThinking,
  'gemini': extractGeminiThinking,
  // Add more model extractors as needed
};

/**
 * Strips thinking content from text using pattern matching
 * @param text - The text to clean
 * @returns Cleaned text with thinking content removed
 */
function stripThinkingPatterns(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text;
  let removedCount = 0;

  // Apply each pattern to remove thinking content
  for (const pattern of THINKING_PATTERNS) {
    let beforeLength = cleaned.length;
    cleaned = cleaned.replace(pattern, '');
    // Loop to replace all occurrences of the pattern
    while (cleaned.length < beforeLength) {
      removedCount++;
      beforeLength = cleaned.length;
      cleaned = cleaned.replace(pattern, '');
    }
  }

  // Log if we removed thinking content
  if (removedCount > 0) {
    logger.debug(`Stripped thinking patterns from content`, {
      patternsRemoved: removedCount,
      sizeReduction: text.length - cleaned.length
    });
  }

  // Clean up extra whitespace
  return cleaned.trim().replace(/\n\s*\n\s*\n/g, '\n\n');
}

/**
 * Strips thinking content from model response envelope
 * @param envelope - Response envelope that may contain thinking content
 * @returns Cleaned content string with all thinking content removed
 */
export function stripThinking(envelope: ModelResponseEnvelope): string {
  const { content, reasoning, thinking } = envelope;

  // Start with the main content
  let cleaned = content || '';

  // If there's explicit reasoning/thinking content, ignore it
  // We NEVER return thinking content to the client
  if (reasoning || thinking) {
    logger.debug('Ignoring explicit thinking/reasoning field', {
      hasReasoning: !!reasoning,
      hasThinking: !!thinking,
      reasoningLength: reasoning?.length || 0,
      thinkingLength: thinking?.length || 0
    });
  }

  // Strip any thinking patterns from the content itself
  cleaned = stripThinkingPatterns(cleaned);

  // If after cleaning the content is very short and we have reasoning,
  // this might indicate the model only returned thinking content
  // In this case, we return empty string, not the thinking content
  if (cleaned.length < 10 && (reasoning || thinking)) {
    logger.warn('Model response appears to contain only thinking content', {
      contentLength: content?.length || 0,
      reasoningLength: reasoning?.length || 0,
      thinkingLength: thinking?.length || 0
    });
    return '';
  }

  return cleaned;
}

/**
 * Filters thinking content from raw model response
 * This is the main entry point for filtering thinking content
 *
 * @param rawResponse - The raw response from the model API
 * @param modelType - The type of model (e.g., 'glm', 'siliconflow', 'claude', 'gemini')
 * @returns Cleaned content string with thinking content removed
 */
export function filterThinkingContent(rawResponse: unknown, modelType: string): string {
  // modelType is now required - validate it
  if (!modelType) {
    logger.error('modelType is required for thinking filter but was not provided');
    throw new Error('modelType is required for thinking filter');
  }

  try {
    // Use local extractor map to avoid circular dependency with provider-registry
    const extractor = THINKING_EXTRACTORS[modelType.toLowerCase()] || extractOpenAIThinking;

    if (!THINKING_EXTRACTORS[modelType.toLowerCase()]) {
      logger.warn(`No extractor found for model type: ${modelType}, using generic extraction`);
    }

    // 提取 thinking content
    const envelope = extractor(rawResponse);
    return stripThinking(envelope);

  } catch (error) {
    logger.error('Failed to filter thinking content', { error, modelType });

    // Fallback: try to extract content directly from response
    try {
      // @ts-ignore
      const content = rawResponse?.choices?.[0]?.message?.content || '';
      return stripThinkingPatterns(content);
    } catch (fallbackError) {
      logger.error('Fallback content extraction also failed', { error: fallbackError });
      return '';
    }
  }
}
