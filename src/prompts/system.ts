/**
 * System Prompt Templates
 *
 * @description 内置的系统提示词模板，覆盖常见视觉任务场景
 */

export interface SystemPromptTemplate {
  id: string;
  name: string;
  template: string;
  description: string;
  useCases: string[];
}

/**
 * 基础系统提示词
 * 提供通用指导原则和规范
 */
export const BASE_SYSTEM_PROMPT = `You are a vision analysis assistant with access to image data.

Your task is to analyze images accurately and provide helpful responses based on what you see.

Guidelines:
1. Be precise and detailed in your observations
2. When coordinates or measurements are requested, provide them in the format specified
3. If an image is unclear or ambiguous, acknowledge the limitations
4. Convert any complex structured data to the requested format
5. Be helpful and follow the specific instructions provided by the user

Remember: You are providing visual information to another AI system, so clarity and structure are important.`;

/**
 * 通用描述模板
 */
export const GENERAL_DESCRIPTION_TEMPLATE: SystemPromptTemplate = {
  id: 'general-description',
  name: 'General Description',
  description: 'Provide a detailed description of the image',
  useCases: ['image description', 'scene analysis', 'object identification'],
  template: `${BASE_SYSTEM_PROMPT}

Analyze this image and provide a comprehensive description. Include:
- Main objects and their characteristics
- Setting or environment
- Colors, lighting, and composition
- Any text or symbols visible
- Overall mood or atmosphere

Focus on observable details and be specific.`
};

/**
 * UI 分析模板
 * 用于分析 UI 原型图、截图等
 */
export const UI_ANALYSIS_TEMPLATE: SystemPromptTemplate = {
  id: 'ui-analysis',
  name: 'UI Analysis',
  description: 'Analyze UI prototypes and screenshots',
  useCases: ['UI design analysis', 'interface review', 'component identification'],
  template: `${BASE_SYSTEM_PROMPT}

You are analyzing a UI design or interface screenshot. Your goal is to extract structured information about the UI elements and layout.

Please provide:
1. **Overall Layout**
   - Screen/window dimensions (if apparent)
   - Layout type (grid, flex, absolute positioning, etc.)
   - Main sections and their relative positions

2. **UI Components**
   - Identify all interactive elements (buttons, inputs, links, etc.)
   - For each component, provide:
     * Type (button, input, card, navigation, etc.)
     * Text content or labels
     * Approximate position and size (relative coordinates or percentages)
     * Visual style (colors, borders, shadows, etc.)

3. **Visual Hierarchy**
   - Primary actions and elements
   - Secondary or supporting elements
   - Navigation structure

4. **Design Patterns**
   - Common patterns used (cards, lists, modals, etc.)
   - Responsive design considerations
   - Accessibility features (if visible)

5. **Content Analysis**
   - Text content and typography
   - Images and media elements
   - Icons and symbols

If you need to provide coordinates or positions, use:
- Either percentage-based coordinates (x, y, width, height as percentages)
- Or pixel coordinates if the image dimensions are clear
Format: {x: 10, y: 20, width: 30, height: 15} (in respective units)

Be precise about relationships between elements and their spatial arrangement.`
};

/**
 * 对象定位和检测模板
 */
export const OBJECT_DETECTION_TEMPLATE: SystemPromptTemplate = {
  id: 'object-detection',
  name: 'Object Detection and Localization',
  description: 'Detect and locate objects in the image with coordinates',
  useCases: ['object detection', 'element positioning', 'bounding box localization'],
  template: `${BASE_SYSTEM_PROMPT}

Your task is to identify and locate specific objects or elements in the image. For each detected object, provide:

1. **Object Information**
   - Object class/type
   - Description and characteristics
   - Confidence level (if applicable)

2. **Position and Size**
   - Bounding box coordinates in this format: {x: 10, y: 20, width: 30, height: 15}
   - Coordinate system: origin (0,0) at top-left, units are percentage of image dimensions
   - Alternative: If percentages aren't appropriate, describe relative position (e.g., "center", "top-right")

3. **Additional Details**
   - Color, size, or other distinguishing features
   - Relationship to other objects
   - Any text or labels associated with the object

If multiple objects of the same type exist, list them all with their unique positions.

Please format the response as structured data that can be easily parsed.`
};

/**
 * OCR 和文本提取模板
 */
export const OCR_TEMPLATE: SystemPromptTemplate = {
  id: 'ocr',
  name: 'OCR and Text Extraction',
  description: 'Extract text from images with positioning',
  useCases: ['text extraction', 'OCR', 'document scanning'],
  template: `${BASE_SYSTEM_PROMPT}

Extract all visible text from the image with the following details:

1. **Text Content**
   - All readable text in the image
   - Maintain the original structure and grouping
   - Preserve formatting if relevant (headings, paragraphs, lists)

2. **Text Positioning**
   - For each text element, provide approximate coordinates
   - Format: {text: "content", x: 10, y: 20, width: 30, height: 15}
   - Coordinates are optional but helpful for reference

3. **Additional Information**
   - Font characteristics (if apparent: size, weight, style)
   - Text color and background
   - Language detection if multiple languages present

4. **Structured Output**
   - Organize extracted text logically
   - Group related text elements
   - Indicate hierarchy if present (titles, body text, captions)

Present the extracted information in a clear, structured format that preserves the original layout information.`
};

/**
 * 结构化信息提取模板
 */
export const STRUCTURED_EXTRACTION_TEMPLATE: SystemPromptTemplate = {
  id: 'structured-extraction',
  name: 'Structured Information Extraction',
  description: 'Extract structured data according to a specific schema',
  useCases: ['data extraction', 'form processing', 'structured analysis'],
  template: `${BASE_SYSTEM_PROMPT}

Extract structured information from the image following the user's specified schema or format. Focus on:

1. **Identifying Key Information**
   - Extract all relevant data points
   - Capture relationships between data elements
   - Include contextual information

2. **Data Validation**
   - Verify data types and formats
   - Note any missing or ambiguous information
   - Flag potential errors or inconsistencies

3. **Output Structure**
   - Follow the requested JSON schema or format exactly
   - Include all required fields
   - Use appropriate data types (string, number, array, object)

4. **Quality Assurance**
   - Double-check extracted values for accuracy
   - Provide confidence levels if uncertain
   - Note any assumptions made

If specific fields or format are requested in the user prompt, prioritize those requirements.`
};

/**
 * 获取系统提示词模板
 *
 * @param templateId 模板 ID
 * @param customInstructions 额外的自定义指令（可选）
 * @returns 完整的系统提示词
 */
export function getSystemPrompt(templateId: string, customInstructions?: string): string {
  const template = SYSTEM_PROMPT_TEMPLATES[templateId];

  if (!template) {
    throw new Error(`Unknown template ID: ${templateId}`);
  }

  let prompt = template.template;

  // 如果有自定义指令，追加到提示词中
  if (customInstructions) {
    prompt += `\n\n=== Additional Instructions ===\n${customInstructions}`;
  }

  return prompt;
}

/**
 * 所有可用的系统提示词模板
 */
export const SYSTEM_PROMPT_TEMPLATES: Record<string, SystemPromptTemplate> = {
  'general-description': GENERAL_DESCRIPTION_TEMPLATE,
  'ui-analysis': UI_ANALYSIS_TEMPLATE,
  'object-detection': OBJECT_DETECTION_TEMPLATE,
  'ocr': OCR_TEMPLATE,
  'structured-extraction': STRUCTURED_EXTRACTION_TEMPLATE
};

/**
 * 获取模板列表
 */
export function getAvailableTemplates(): Array<{
  id: string;
  name: string;
  description: string;
  useCases: string[];
}> {
  return Object.values(SYSTEM_PROMPT_TEMPLATES).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    useCases: t.useCases
  }));
}

/**
 * 自动选择合适的模板
 *
 * @param prompt 用户提示词
 * @returns 推荐的模板 ID
 */
export function autoSelectTemplate(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  // 关键词匹配
  if (lowerPrompt.includes('ui') || lowerPrompt.includes('interface') || lowerPrompt.includes('prototype')) {
    return 'ui-analysis';
  }

  if (lowerPrompt.includes('detect') || lowerPrompt.includes('locate') || lowerPrompt.includes('position')) {
    return 'object-detection';
  }

  if (lowerPrompt.includes('ocr') || lowerPrompt.includes('text') || lowerPrompt.includes('extract text')) {
    return 'ocr';
  }

  if (lowerPrompt.includes('json') || lowerPrompt.includes('structured') || lowerPrompt.includes('schema')) {
    return 'structured-extraction';
  }

  if (lowerPrompt.includes('describe') || lowerPrompt.includes('what') || lowerPrompt.includes('explain')) {
    return 'general-description';
  }

  // 默认使用通用描述模板
  return 'general-description';
}

/**
 * 构建完整的提示词
 *
 * @param templateId 模板 ID
 * @param userPrompt 用户提示词
 * @returns 构建完成的提示词
 */
export function buildPrompt(templateId: string | undefined, userPrompt: string): string {
  // 如果没有指定模板，自动选择
  const selectedTemplateId = templateId || autoSelectTemplate(userPrompt);

  // 构建完整提示词
  const systemPrompt = getSystemPrompt(selectedTemplateId);

  // 组合系统提示词和用户提示词
  // Note: 实际使用时可能在消息数组中分别传递
  return `${systemPrompt}\n\n=== User Request ===\n${userPrompt}`;
}
