const express = require('express');
const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

// 日志文件路径
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
const LOG_FILE = path.join(LOGS_DIR, 'server-debug.log');
const ERROR_LOG_FILE = path.join(LOGS_DIR, 'server-error.log');
const RAW_REQUEST_LOG_FILE = path.join(LOGS_DIR, 'claude-code-requests.log');

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage, 'utf8');
}

function logObject(label, obj) {
  const message = `${label}:\n${JSON.stringify(obj, null, 2)}`;
  log(message);
}

function logError(message, error = null) {
  const timestamp = new Date().toISOString();
  let errorMessage = `[${timestamp}] ❌ ${message}\n`;
  if (error) {
    errorMessage += `错误详情: ${error.message}\n`;
    if (error.stack) {
      errorMessage += `堆栈跟踪:\n${error.stack}\n`;
    }
  }
  errorMessage += '\n';
  console.error(message);
  if (error) console.error('错误详情:', error.message);
  fs.appendFileSync(ERROR_LOG_FILE, errorMessage, 'utf8');
  fs.appendFileSync(LOG_FILE, errorMessage, 'utf8');
}

// 清空日志文件
fs.writeFileSync(LOG_FILE, `=== 服务器启动于 ${new Date().toISOString()} ===\n\n`, 'utf8');
fs.writeFileSync(ERROR_LOG_FILE, `=== 错误日志启动于 ${new Date().toISOString()} ===\n\n`, 'utf8');
fs.writeFileSync(RAW_REQUEST_LOG_FILE, `=== Claude Code 原始请求日志启动于 ${new Date().toISOString()} ===\n\n`, 'utf8');
log('日志文件已初始化: ' + LOG_FILE);
log('原始请求日志文件: ' + RAW_REQUEST_LOG_FILE);

/**
 * Claude API 错误类型映射
 * 将 Kiro/HTTP 错误转换为 Claude API 标准错误格式
 */
const ERROR_TYPES = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  404: 'not_found_error',
  429: 'rate_limit_error',
  500: 'api_error',
  502: 'api_error',
  503: 'overloaded_error',
  504: 'api_error'
};

/**
 * 将错误转换为 Claude API 格式
 */
function formatClaudeError(error, defaultStatus = 500) {
  let status = defaultStatus;
  let errorType = 'api_error';
  let message = error.message || '服务器内部错误';
  
  // 从错误消息中提取状态码
  const statusMatch = message.match(/API Error (\d+)/);
  if (statusMatch) {
    status = parseInt(statusMatch[1], 10);
  }
  
  // 根据状态码确定错误类型
  errorType = ERROR_TYPES[status] || 'api_error';
  
  // 特殊错误消息处理
  if (message.includes('token') || message.includes('Token') || message.includes('unauthorized')) {
    errorType = 'authentication_error';
    status = 401;
  } else if (message.includes('rate limit') || message.includes('too many')) {
    errorType = 'rate_limit_error';
    status = 429;
  } else if (message.includes('not found')) {
    errorType = 'not_found_error';
    status = 404;
  } else if (message.includes('permission') || message.includes('forbidden')) {
    errorType = 'permission_error';
    status = 403;
  } else if (message.includes('overloaded') || message.includes('capacity')) {
    errorType = 'overloaded_error';
    status = 503;
  }
  
  return {
    status,
    body: {
      type: 'error',
      error: {
        type: errorType,
        message: message
      }
    }
  };
}

// 加载模型映射配置
let modelMapping = {};
let defaultModel = 'claude-sonnet-4.5';

try {
  const mappingFile = fs.readFileSync(path.join(__dirname, '..', 'config', 'model-mapping.json'), 'utf8');
  const mappingConfig = JSON.parse(mappingFile);
  modelMapping = mappingConfig.mappings || {};
  defaultModel = mappingConfig.defaultModel || 'claude-sonnet-4.5';
  log(`✅ 加载模型映射配置: ${Object.keys(modelMapping).length} 个映射`);
} catch (error) {
  logError('无法加载模型映射配置，使用默认映射', error);
  modelMapping = {
    'claude-sonnet-4.5': 'claude-sonnet-4.5',
    'claude-haiku-4.5': 'claude-haiku-4.5',
    'claude-opus-4.5': 'claude-opus-4.5'
  };
}

function mapModelId(claudeModelId) {
  const kiroModelId = modelMapping[claudeModelId];
  if (kiroModelId) {
    if (claudeModelId !== kiroModelId) {
      log(`[模型映射] ${claudeModelId} -> ${kiroModelId}`);
    }
    return kiroModelId;
  }
  const lowerModelId = claudeModelId.toLowerCase();
  if (lowerModelId.includes('sonnet')) return 'claude-sonnet-4.5';
  if (lowerModelId.includes('haiku')) return 'claude-haiku-4.5';
  if (lowerModelId.includes('opus')) return 'claude-opus-4.5';
  return defaultModel;
}

// 初始化 Kiro 客户端
let kiroClient;
try {
  const BEARER_TOKEN = loadToken();
  kiroClient = new KiroClient(BEARER_TOKEN);
  log('✅ Kiro 客户端初始化成功');
} catch (error) {
  logError('Kiro 客户端初始化失败', error);
  process.exit(1);
}

/**
 * 智能分段保留 description 的关键内容
 * 按优先级保留：核心描述 > 规则 > 参数说明 > 简短示例
 */
function smartTruncateDescription(desc, maxLength) {
  if (!desc || desc.length <= maxLength) return desc;
  
  // 按 markdown 标题或关键词分段
  const sections = [];
  let currentSection = { title: 'intro', content: '', priority: 1 };
  
  const lines = desc.split('\n');
  for (const line of lines) {
    // 检测标题行
    const headerMatch = line.match(/^#+\s*(.+)$/) || line.match(/^([A-Z][A-Za-z\s]+):$/);
    if (headerMatch) {
      if (currentSection.content.trim()) {
        sections.push(currentSection);
      }
      const title = headerMatch[1].toLowerCase();
      // 根据标题设置优先级
      let priority = 5; // 默认低优先级
      if (title.includes('rule') || title.includes('important') || title.includes('critical')) {
        priority = 2;
      } else if (title.includes('usage') || title.includes('parameter') || title.includes('when to use')) {
        priority = 3;
      } else if (title.includes('example')) {
        priority = 4;
      } else if (title.includes('commit') || title.includes('pull request') || title.includes('pr')) {
        priority = 6; // git 相关的详细说明优先级最低
      }
      currentSection = { title: title, content: line + '\n', priority };
    } else {
      currentSection.content += line + '\n';
    }
  }
  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }
  
  // 按优先级排序
  sections.sort((a, b) => a.priority - b.priority);
  
  // 逐个添加，直到达到长度限制
  let result = '';
  const addedSections = [];
  
  for (const section of sections) {
    const sectionText = section.content.trim();
    if (result.length + sectionText.length + 10 < maxLength) {
      addedSections.push(section);
      result += sectionText + '\n\n';
    } else if (section.priority <= 2) {
      // 高优先级内容，即使超长也要截断保留部分
      const remaining = maxLength - result.length - 50;
      if (remaining > 200) {
        result += sectionText.substring(0, remaining) + '...\n\n';
      }
      break;
    }
  }
  
  // 按原始顺序重新排列
  addedSections.sort((a, b) => {
    const aIndex = sections.findIndex(s => s === a);
    const bIndex = sections.findIndex(s => s === b);
    return aIndex - bIndex;
  });
  
  return result.trim();
}

/**
 * 将 Claude API 的 tools 格式转换为 Kiro API 格式
 */
function convertToolsToKiroFormat(claudeTools) {
  if (!claudeTools || !Array.isArray(claudeTools)) return [];
  
  const MAX_DESCRIPTION_LENGTH = 4500;
  
  function simplifyPropertySchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    
    const result = {};
    if (schema.type) result.type = schema.type;
    if (schema.description) {
      result.description = schema.description.length > MAX_DESCRIPTION_LENGTH 
        ? schema.description.substring(0, MAX_DESCRIPTION_LENGTH) + '...'
        : schema.description;
    }
    if (schema.enum) result.enum = schema.enum;
    if (schema.default !== undefined) result.default = schema.default;
    
    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = simplifyPropertySchema(value);
      }
    }
    
    if (schema.required) result.required = schema.required;
    if (schema.additionalProperties !== undefined) {
      result.additionalProperties = schema.additionalProperties;
    }
    if (schema.items) {
      result.items = simplifyPropertySchema(schema.items);
    }
    
    return result;
  }
  
  return claudeTools.map(tool => {
    const inputSchema = JSON.parse(JSON.stringify(tool.input_schema || {}));
    
    const simplifiedSchema = {
      '$schema': 'http://json-schema.org/draft-07/schema#',
      'type': inputSchema.type || 'object',
      'properties': {},
      'additionalProperties': false
    };
    
    if (inputSchema.properties) {
      for (const [key, value] of Object.entries(inputSchema.properties)) {
        simplifiedSchema.properties[key] = simplifyPropertySchema(value);
      }
    }
    
    if (inputSchema.required) {
      simplifiedSchema.required = inputSchema.required;
    }
    
    let toolDescription = tool.description || '';
    if (toolDescription.length > MAX_DESCRIPTION_LENGTH) {
      const originalLength = toolDescription.length;
      toolDescription = smartTruncateDescription(toolDescription, MAX_DESCRIPTION_LENGTH);
      log(`[Tools] 智能截断 ${tool.name} 的 description (${originalLength} -> ${toolDescription.length})`);
    }
    
    return {
      toolSpecification: {
        name: tool.name,
        description: toolDescription,
        inputSchema: {
          json: simplifiedSchema
        }
      }
    };
  });
}

/**
 * 从消息中提取 tool_result 并转换为 Kiro 格式
 */
function extractToolResults(message) {
  const toolResults = [];
  if (message && message.role === 'user' && Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === 'tool_result') {
        toolResults.push({
          toolUseId: block.tool_use_id,
          status: block.is_error ? 'error' : 'success',
          content: [{
            text: typeof block.content === 'string' 
              ? block.content 
              : JSON.stringify(block.content)
          }]
        });
      }
    }
  }
  return toolResults;
}

/**
 * 从 Claude API 消息中提取图片并转换为 Kiro 格式
 */
function extractImages(message) {
  const images = [];
  if (message && message.role === 'user' && Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === 'image' && block.source) {
        let format = 'jpeg';
        if (block.source.media_type) {
          const parts = block.source.media_type.split('/');
          if (parts.length === 2) {
            format = parts[1];
          }
        }
        
        if (block.source.type === 'base64' && block.source.data) {
          images.push({
            format: format,
            source: {
              bytes: block.source.data
            }
          });
          log(`[Images] 提取到 base64 图片, 格式: ${format}, 大小: ${block.source.data.length} 字符`);
        } else if (block.source.type === 'url' && block.source.url) {
          log(`[Images] ⚠️ 检测到 URL 类型图片，Kiro 可能不支持: ${block.source.url}`);
        }
      }
    }
  }
  return images;
}

/**
 * 记录 Claude Code 客户端的原始请求
 */
function logRawRequest(req) {
  const timestamp = new Date().toISOString();
  const separator = '='.repeat(80);
  
  let logContent = `\n${separator}\n`;
  logContent += `[${timestamp}] 收到请求\n`;
  logContent += `${separator}\n\n`;
  
  // 记录请求头
  logContent += `【请求头】\n`;
  logContent += `Content-Type: ${req.headers['content-type']}\n`;
  logContent += `Content-Length: ${req.headers['content-length']}\n\n`;
  
  // 记录请求体概要
  const body = req.body;
  logContent += `【请求概要】\n`;
  logContent += `Model: ${body.model}\n`;
  logContent += `Stream: ${body.stream}\n`;
  logContent += `Messages 数量: ${body.messages?.length || 0}\n`;
  logContent += `Tools 数量: ${body.tools?.length || 0}\n\n`;
  
  // 记录最后一条消息的详细内容
  if (body.messages && body.messages.length > 0) {
    const lastMessage = body.messages[body.messages.length - 1];
    logContent += `【最后一条消息详情】\n`;
    logContent += `Role: ${lastMessage.role}\n`;
    
    if (typeof lastMessage.content === 'string') {
      logContent += `Content Type: string\n`;
      logContent += `Content: ${lastMessage.content.substring(0, 500)}${lastMessage.content.length > 500 ? '...(截断)' : ''}\n`;
    } else if (Array.isArray(lastMessage.content)) {
      logContent += `Content Type: array (${lastMessage.content.length} 个块)\n`;
      lastMessage.content.forEach((block, index) => {
        logContent += `\n  [Block ${index}]\n`;
        logContent += `  Type: ${block.type}\n`;
        if (block.type === 'text') {
          const text = block.text || '';
          logContent += `  Text: ${text.substring(0, 300)}${text.length > 300 ? '...(截断)' : ''}\n`;
        } else if (block.type === 'image') {
          logContent += `  Image Source Type: ${block.source?.type}\n`;
          logContent += `  Image Media Type: ${block.source?.media_type}\n`;
          logContent += `  Image Data Length: ${block.source?.data?.length || 0}\n`;
        } else if (block.type === 'tool_result') {
          logContent += `  Tool Use ID: ${block.tool_use_id}\n`;
          logContent += `  Is Error: ${block.is_error}\n`;
          const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          logContent += `  Content: ${content.substring(0, 300)}${content.length > 300 ? '...(截断)' : ''}\n`;
        } else if (block.type === 'tool_use') {
          logContent += `  Tool Name: ${block.name}\n`;
          logContent += `  Tool ID: ${block.id}\n`;
          logContent += `  Input: ${JSON.stringify(block.input).substring(0, 200)}\n`;
        } else {
          // 记录未知类型的完整内容
          logContent += `  Raw: ${JSON.stringify(block).substring(0, 500)}\n`;
        }
      });
    }
  }
  
  logContent += `\n${separator}\n`;
  
  fs.appendFileSync(RAW_REQUEST_LOG_FILE, logContent, 'utf8');
  
  // 保存完整的原始请求体到单独的 JSON 文件（每次覆盖，只保留最新一次）
  const fullRequestFile = path.join(LOGS_DIR, 'last-raw-request.json');
  fs.writeFileSync(fullRequestFile, JSON.stringify(body, null, 2), 'utf8');
}

/**
 * Claude API 兼容端点: /v1/messages
 */
app.post('/v1/messages', async (req, res) => {
  log('\n========== 收到 /v1/messages 请求 ==========');
  log(`请求体大小: ${JSON.stringify(req.body).length} 字节`);
  log('==========================================\n');
  
  // 记录原始请求到单独的日志文件
  logRawRequest(req);
  
  try {
    const {
      model = 'claude-sonnet-4.5',
      messages = [],
      stream = false,
      system,
      tools = []
    } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'messages 参数不能为空' }
      });
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return res.status(400).json({
        type: 'error',
        error: { type: 'invalid_request_error', message: '最后一条消息必须是 user 角色' }
      });
    }

    // 提取用户消息内容（文本部分）
    let userMessage = '';
    if (typeof lastMessage.content === 'string') {
      userMessage = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
      userMessage = lastMessage.content
        .filter(c => c && c.type === 'text')
        .map(c => c.text)
        .join('\n');
    }

    const toolResults = extractToolResults(lastMessage);
    const images = extractImages(lastMessage);
    
    if (!userMessage && toolResults.length === 0 && images.length === 0) {
      return res.status(400).json({
        type: 'error',
        error: { type: 'invalid_request_error', message: '消息内容不能为空' }
      });
    }
    
    log(`[Images] 当前消息包含 ${images.length} 张图片`);

    // 处理 system prompt
    let systemPrompt = '';
    if (system) {
      if (typeof system === 'string') {
        systemPrompt = system;
      } else if (Array.isArray(system)) {
        systemPrompt = system.filter(s => s && s.type === 'text').map(s => s.text).join('\n\n');
      }
    }

    const kiroTools = convertToolsToKiroFormat(tools);
    log(`[Tools] 转换了 ${kiroTools.length} 个工具定义`);
    log(`[Tool Results] 检测到 ${toolResults.length} 个工具结果`);

    // 构建历史记录
    const history = [];
    
    if (systemPrompt) {
      history.push({
        userInputMessage: {
          content: systemPrompt,
          modelId: mapModelId(model),
          origin: 'AI_EDITOR'
        }
      });
      history.push({
        assistantResponseMessage: {
          content: "I will follow these instructions."
        }
      });
    }
    
    // 处理对话历史（除了最后一条消息）
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      
      if (msg.role === 'user') {
        let userContent = '';
        const userToolResults = [];
        const userImages = [];
        
        if (typeof msg.content === 'string') {
          userContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              userContent += (userContent ? '\n' : '') + block.text;
            } else if (block.type === 'tool_result') {
              userToolResults.push({
                toolUseId: block.tool_use_id,
                status: block.is_error ? 'error' : 'success',
                content: [{
                  text: typeof block.content === 'string' 
                    ? block.content 
                    : JSON.stringify(block.content)
                }]
              });
            } else if (block.type === 'image' && block.source) {
              let format = 'jpeg';
              if (block.source.media_type) {
                const parts = block.source.media_type.split('/');
                if (parts.length === 2) {
                  format = parts[1];
                }
              }
              if (block.source.type === 'base64' && block.source.data) {
                userImages.push({
                  format: format,
                  source: {
                    bytes: block.source.data
                  }
                });
              }
            }
          }
        }
        
        const userInputMessage = {
          content: userContent,
          modelId: mapModelId(model),
          origin: 'AI_EDITOR'
        };
        
        if (userImages.length > 0) {
          userInputMessage.images = userImages;
        }
        
        if (userToolResults.length > 0) {
          userInputMessage.userInputMessageContext = {
            toolResults: userToolResults
          };
        }
        
        history.push({ userInputMessage });
        
      } else if (msg.role === 'assistant') {
        let assistantContent = '';
        const assistantToolUses = [];
        
        if (typeof msg.content === 'string') {
          assistantContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              assistantContent += block.text;
            } else if (block.type === 'tool_use') {
              assistantToolUses.push({
                name: block.name,
                toolUseId: block.id,
                input: block.input
              });
            }
          }
        }
        
        const assistantResponseMessage = {
          content: assistantContent
        };
        
        if (assistantToolUses.length > 0) {
          assistantResponseMessage.toolUses = assistantToolUses;
        }
        
        history.push({ assistantResponseMessage });
      }
    }

    const conversationId = uuidv4();
    const kiroModelId = mapModelId(model);

    log(`[请求] Claude模型: ${model}, Kiro模型: ${kiroModelId}, 消息数: ${messages.length}, 流式: ${stream}`);
    log(`[历史] ${history.length} 条记录`);
    log(`[当前消息] ${(userMessage || '(tool_result)').substring(0, 50)}...`);

    const userInputMessageContext = {};
    if (kiroTools.length > 0) {
      userInputMessageContext.tools = kiroTools;
    }
    if (toolResults.length > 0) {
      userInputMessageContext.toolResults = toolResults;
    }
    
    const currentUserInputMessage = {
      content: userMessage,
      modelId: kiroModelId,
      origin: 'AI_EDITOR',
      userInputMessageContext: userInputMessageContext
    };
    
    if (images.length > 0) {
      currentUserInputMessage.images = images;
    }
    
    const conversationState = {
      agentTaskType: 'vibe',
      chatTriggerType: 'MANUAL',
      conversationId,
      currentMessage: {
        userInputMessage: currentUserInputMessage
      },
      history
    };
    fs.writeFileSync(path.join(LOGS_DIR, 'conversationState-debug.json'), JSON.stringify(conversationState, null, 2), 'utf8');

    // 非流式响应
    if (!stream) {
      const result = await kiroClient.chat(userMessage, {
        modelId: kiroModelId,
        conversationId,
        history,
        tools: kiroTools.length > 0 ? kiroTools : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        images: images.length > 0 ? images : undefined
      });

      log(`[响应] content 长度: ${result.content ? result.content.length : 0}`);

      const contentBlocks = [];
      if (result.parsedContent && result.parsedContent.text) {
        contentBlocks.push({ type: 'text', text: result.parsedContent.text });
      }
      if (result.parsedContent && result.parsedContent.toolUses && result.parsedContent.toolUses.length > 0) {
        contentBlocks.push(...result.parsedContent.toolUses);
      }
      if (contentBlocks.length === 0 && result.content) {
        contentBlocks.push({ type: 'text', text: result.content });
      }

      return res.json({
        id: `msg_${uuidv4().replace(/-/g, '')}`,
        type: 'message',
        role: 'assistant',
        content: contentBlocks,
        model: model,
        stop_reason: (result.parsedContent && result.parsedContent.toolUses && result.parsedContent.toolUses.length > 0) ? 'tool_use' : 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: result.usage?.input_tokens || 0,
          output_tokens: result.usage?.output_tokens || 0
        }
      });
    }

    // 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messageId = `msg_${uuidv4().replace(/-/g, '')}`;

    // 延迟发送开始事件，等收到第一个实际内容后再发
    let streamStarted = false;
    let currentToolIndex = 0;
    let toolIndexMap = {};
    let textBlockEnded = false;
    let hasTextContent = false;  // 跟踪是否有文本内容
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // 发送流开始事件的辅助函数
    const ensureStreamStarted = () => {
      if (!streamStarted) {
        streamStarted = true;
        res.write(`event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: { id: messageId, type: 'message', role: 'assistant', content: [], model: model, usage: { input_tokens: 0, output_tokens: 0 } }
        })}\n\n`);

        res.write(`event: content_block_start\ndata: ${JSON.stringify({
          type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' }
        })}\n\n`);
      }
    };

    const result = await kiroClient.chat(userMessage, {
      modelId: kiroModelId,
      conversationId,
      history,
      tools: kiroTools.length > 0 ? kiroTools : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
      images: images.length > 0 ? images : undefined,
      onChunk: (chunk) => {
        if (chunk.type === 'content') {
          // 收到第一个内容时才发送开始事件
          ensureStreamStarted();
          hasTextContent = true;  // 标记有文本内容
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk.data }
          })}\n\n`);
        } else if (chunk.type === 'tool_use_start') {
          // 工具调用开始时也要确保流已启动
          ensureStreamStarted();
          // 如果开始工具调用但还没有文本内容，注入占位文本
          if (!hasTextContent && !textBlockEnded) {
            const placeholderText = '​';  // 零宽空格，不可见但有内容
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: placeholderText }
            })}\n\n`);
            hasTextContent = true;
          }
          if (!textBlockEnded) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
            textBlockEnded = true;
          }
          
          currentToolIndex++;
          toolIndexMap[chunk.toolUseId] = currentToolIndex;
          
          log(`[流式响应] 工具调用开始: ${chunk.name} (${chunk.toolUseId}) index=${currentToolIndex}`);
          
          res.write(`event: content_block_start\ndata: ${JSON.stringify({
            type: 'content_block_start',
            index: currentToolIndex,
            content_block: { type: 'tool_use', id: chunk.toolUseId, name: chunk.name, input: {} }
          })}\n\n`);
        } else if (chunk.type === 'tool_use_delta') {
          const toolIndex = toolIndexMap[chunk.toolUseId];
          if (toolIndex !== undefined && chunk.inputDelta) {
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: toolIndex,
              delta: { type: 'input_json_delta', partial_json: chunk.inputDelta }
            })}\n\n`);
          }
        } else if (chunk.type === 'tool_use_stop') {
          const toolIndex = toolIndexMap[chunk.toolUseId];
          if (toolIndex !== undefined) {
            log(`[流式响应] 工具调用结束: ${chunk.name} index=${toolIndex}`);
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: toolIndex })}\n\n`);
          }
        }
      }
    });

    totalInputTokens = result.usage?.input_tokens || 0;
    totalOutputTokens = result.usage?.output_tokens || 0;

    const hasToolUses = result.parsedContent && result.parsedContent.toolUses && result.parsedContent.toolUses.length > 0;
    
    // 如果流还没开始（没有任何内容），现在发送开始事件
    ensureStreamStarted();
    
    if (!textBlockEnded) {
      res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
    }
    
    if (hasToolUses) {
      log(`[流式响应] 共 ${result.parsedContent.toolUses.length} 个工具调用`);
      
      res.write(`event: message_delta\ndata: ${JSON.stringify({ 
        type: 'message_delta', 
        delta: { stop_reason: 'tool_use', stop_sequence: null }, 
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } 
      })}\n\n`);
    } else {
      res.write(`event: message_delta\ndata: ${JSON.stringify({ 
        type: 'message_delta', 
        delta: { stop_reason: 'end_turn', stop_sequence: null }, 
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } 
      })}\n\n`);
    }
    
    res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    res.end();

  } catch (error) {
    logError('API 请求处理失败', error);
    if (!res.headersSent) {
      const formattedError = formatClaudeError(error);
      res.status(formattedError.status).json(formattedError.body);
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kiro-claude-api' });
});

app.get('/v1/models', async (req, res) => {
  try {
    const result = await kiroClient.listAvailableModels();
    const models = Array.from(result.modelsMap.entries()).map(([id, info]) => ({
      id, object: 'model', created: Date.now(), owned_by: 'kiro', display_name: info.name
    }));
    res.json({ object: 'list', data: models });
  } catch (error) {
    logError('获取模型列表失败', error);
    const formattedError = formatClaudeError(error);
    res.status(formattedError.status).json(formattedError.body);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`🚀 Claude API 兼容服务器运行在 http://localhost:${PORT}`);
  log(`📝 API 端点: POST http://localhost:${PORT}/v1/messages`);
  log(`📋 模型列表: GET http://localhost:${PORT}/v1/models`);
});
