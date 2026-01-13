const express = require('express');
const KiroClient = require('./KiroClient');
const { loadToken, loadTokenWithRefresh, loadTokenInfo, needsRefresh } = require('./loadToken');
const { getBestAccountToken, getAccountToken, accountNeedsRefresh, findAccountById, shouldSwitchAccount, switchToNextAccount, getAvailableAccounts } = require('./loadMultiAccount');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const webAdminRouter = require('./web-admin');

const app = express();
app.use(express.json({ limit: '50mb' }));

// 静态文件服务 - Web管理界面
app.use(express.static(path.join(__dirname, '..', 'public')));

// Web管理API路由
app.use(webAdminRouter);

// 日志文件路径
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
const LOG_FILE = path.join(LOGS_DIR, 'server-debug.log');
const ERROR_LOG_FILE = path.join(LOGS_DIR, 'server-error.log');
const CLAUDE_CODE_LOG_FILE = path.join(LOGS_DIR, 'claude-code.log');
const KIRO_API_LOG_FILE = path.join(LOGS_DIR, 'kiro-api.log');

// 基于 WriteStream 的日志类（内置背压控制）
class StreamLogger {
  constructor(filePath) {
    this.filePath = filePath;
    this.stream = null;
    this.draining = false;
    this.dropCount = 0;  // 统计丢弃的消息数
  }

  // 初始化文件并创建写入流
  initSync(content) {
    // 先同步写入初始内容
    fs.writeFileSync(this.filePath, content, 'utf8');
    
    // 创建追加模式的写入流
    this.stream = fs.createWriteStream(this.filePath, {
      flags: 'a',              // 追加模式
      highWaterMark: 64 * 1024 // 64KB 缓冲区
    });

    // 背压恢复事件
    this.stream.on('drain', () => {
      this.draining = false;
      if (this.dropCount > 0) {
        console.warn(`[日志] 背压恢复，期间丢弃了 ${this.dropCount} 条消息`);
        this.dropCount = 0;
      }
    });

    // 错误处理
    this.stream.on('error', (err) => {
      console.error(`[日志] 写入流错误 (${this.filePath}):`, err.message);
    });
  }

  write(message) {
    if (!this.stream) {
      console.error('[日志] 写入流未初始化');
      return;
    }

    // 背压控制：缓冲区满时丢弃消息
    if (this.draining) {
      this.dropCount++;
      return;
    }

    const ok = this.stream.write(message);
    if (!ok) {
      this.draining = true;
    }
  }

  // 优雅关闭，确保数据刷盘
  close() {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// 创建日志实例
const mainLogger = new StreamLogger(LOG_FILE);
const errorLogger = new StreamLogger(ERROR_LOG_FILE);
const claudeCodeLogger = new StreamLogger(CLAUDE_CODE_LOG_FILE);
const kiroApiLogger = new StreamLogger(KIRO_API_LOG_FILE);

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  mainLogger.write(logMessage);
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
  errorLogger.write(errorMessage);
  mainLogger.write(errorMessage);
}

// 初始化日志文件（同步，仅启动时）
mainLogger.initSync(`=== 服务器启动于 ${new Date().toISOString()} ===\n\n`);
errorLogger.initSync(`=== 错误日志启动于 ${new Date().toISOString()} ===\n\n`);
claudeCodeLogger.initSync(`=== Claude Code 请求/响应日志启动于 ${new Date().toISOString()} ===\n\n`);
kiroApiLogger.initSync(`=== Kiro API 请求/响应日志启动于 ${new Date().toISOString()} ===\n\n`);
log('日志文件已初始化: ' + LOG_FILE);
log('Claude Code 日志文件: ' + CLAUDE_CODE_LOG_FILE);
log('Kiro API 日志文件: ' + KIRO_API_LOG_FILE);

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
 * 尽量保留原始错误信息，直接透传给客户端
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
  
  // 尝试从错误消息中提取 Kiro API 的原始错误信息
  let originalMessage = message;
  const jsonMatch = message.match(/\{.*"message"\s*:\s*"([^"]+)".*\}/);
  if (jsonMatch) {
    // 提取 JSON 中的 message 字段作为主要错误信息
    originalMessage = jsonMatch[1];
  }
  
  // 根据状态码确定错误类型
  errorType = ERROR_TYPES[status] || 'api_error';
  
  // 特殊错误消息处理 - 基于原始消息内容
  // Kiro 后端认证问题返回 400，让客户端停止重试
  if (originalMessage.includes('token') || originalMessage.includes('Token') || 
      originalMessage.includes('invalid') || originalMessage.includes('unauthorized') ||
      originalMessage.includes('bearer')) {
    errorType = 'invalid_request_error';
    status = 400;
    originalMessage = `[Kiro 后端认证失败] ${originalMessage}`;
  } else if (originalMessage.includes('rate limit') || originalMessage.includes('too many')) {
    errorType = 'rate_limit_error';
  } else if (originalMessage.includes('not found')) {
    errorType = 'not_found_error';
  } else if (originalMessage.includes('overloaded') || originalMessage.includes('capacity')) {
    errorType = 'overloaded_error';
  }
  
  return {
    status,
    body: {
      type: 'error',
      error: {
        type: errorType,
        message: originalMessage
      }
    }
  };
}

// 加载服务器配置
let serverConfig = {
  server: { host: '0.0.0.0', port: 3000 },
  stream: { chunkSize: 4 },
  token: { refreshRetryMax: 3, refreshRetryIntervalMs: 60000, refreshBufferMinutes: 5 },
  connectionPool: { maxSockets: 20, maxFreeSockets: 10, socketTimeout: 60000, requestTimeout: 30000 },
  account: { multiAccountEnabled: false, strategy: 'auto', autoSwitchOnError: true }
};

try {
  const configFile = fs.readFileSync(path.join(__dirname, '..', 'config', 'server-config.json'), 'utf8');
  serverConfig = { ...serverConfig, ...JSON.parse(configFile) };
  log(`✅ 加载服务器配置: host=${serverConfig.server.host}, port=${serverConfig.server.port}, chunkSize=${serverConfig.stream.chunkSize}`);
  log(`   Token 刷新配置: 最大重试=${serverConfig.token.refreshRetryMax}次, 重试间隔=${serverConfig.token.refreshRetryIntervalMs}ms, 提前刷新=${serverConfig.token.refreshBufferMinutes}分钟`);
  log(`   连接池配置: maxSockets=${serverConfig.connectionPool.maxSockets}, maxFreeSockets=${serverConfig.connectionPool.maxFreeSockets}, socketTimeout=${serverConfig.connectionPool.socketTimeout}ms`);
  log(`   账号配置: 多账号模式=${serverConfig.account.multiAccountEnabled ? '启用' : '禁用'}, 策略=${serverConfig.account.strategy}, 自动切换=${serverConfig.account.autoSwitchOnError ? '启用' : '禁用'}`);
} catch (error) {
  log('⚠️ 无法加载服务器配置，使用默认值');
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
let currentToken;
let currentAccount = null; // 当前使用的账号（多账号模式）
let refreshTimer = null;
let refreshRetryCount = 0;

/**
 * 计算下次刷新时间（提前 N 分钟刷新）
 */
function getNextRefreshDelay(expiresAt) {
  const expiresTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const bufferMs = serverConfig.token.refreshBufferMinutes * 60 * 1000;
  const delay = expiresTime - now - bufferMs;
  
  // 最小 10 秒，最大 50 分钟
  return Math.max(10 * 1000, Math.min(delay, 50 * 60 * 1000));
}

/**
 * 获取最大重试次数（等于可用账号数量）
 */
function getMaxRetries() {
  if (!serverConfig.account.multiAccountEnabled || !serverConfig.account.autoSwitchOnError) {
    return 0;
  }
  
  const availableCount = getAvailableAccounts().length;
  return availableCount;
}

/**
 * 后台刷新 Token（不阻塞请求）
 */
async function backgroundRefreshToken() {
  try {
    log('🔄 后台刷新 Token...');
    
    let newToken;
    
    if (serverConfig.account.multiAccountEnabled) {
      // 多账号模式：刷新当前账号
      if (currentAccount) {
        newToken = await getAccountToken(currentAccount.id, { 
          bufferSeconds: serverConfig.token.refreshBufferMinutes * 60 
        });
        // 重新获取账号信息（可能已更新）
        currentAccount = findAccountById(currentAccount.id);
        log(`✅ 账号 ${currentAccount.email} Token 后台刷新成功`);
      } else {
        log('⚠️ 当前没有选中的账号，跳过刷新');
        return;
      }
    } else {
      // 单账号模式
      newToken = await loadTokenWithRefresh({ 
        bufferSeconds: serverConfig.token.refreshBufferMinutes * 60 
      });
    }
    
    if (newToken && newToken !== currentToken) {
      currentToken = newToken;
      kiroClient = new KiroClient(currentToken, {
        maxSockets: serverConfig.connectionPool.maxSockets,
        maxFreeSockets: serverConfig.connectionPool.maxFreeSockets,
        socketTimeout: serverConfig.connectionPool.socketTimeout,
        timeout: serverConfig.connectionPool.requestTimeout
      });
      log('✅ Token 后台刷新成功，客户端已更新');
    }
    
    // 刷新成功，重置重试计数
    refreshRetryCount = 0;
    
    // 设置下次刷新定时器
    scheduleNextRefresh();
  } catch (error) {
    refreshRetryCount++;
    logError(`后台 Token 刷新失败 (${refreshRetryCount}/${serverConfig.token.refreshRetryMax})`, error);
    
    if (refreshRetryCount < serverConfig.token.refreshRetryMax) {
      // 未达到最大重试次数，继续重试
      log(`⏰ ${serverConfig.token.refreshRetryIntervalMs / 1000} 秒后重试...`);
      refreshTimer = setTimeout(backgroundRefreshToken, serverConfig.token.refreshRetryIntervalMs);
    } else {
      // 达到最大重试次数，停止重试
      logError(`❌ Token 刷新已达最大重试次数 (${serverConfig.token.refreshRetryMax})，停止重试。请手动检查 refreshToken 是否有效。`);
    }
  }
}

/**
 * 根据 expiresAt 设置下次刷新定时器
 */
function scheduleNextRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  
  try {
    let expiresAt;
    
    if (serverConfig.account.multiAccountEnabled) {
      // 多账号模式：使用当前账号的过期时间
      if (currentAccount && currentAccount.credentials && currentAccount.credentials.expiresAt) {
        expiresAt = currentAccount.credentials.expiresAt;
      }
    } else {
      // 单账号模式
      const tokenInfo = loadTokenInfo();
      expiresAt = tokenInfo.expiresAt;
    }
    
    if (expiresAt) {
      const delay = getNextRefreshDelay(expiresAt);
      const nextRefreshTime = new Date(Date.now() + delay);
      log(`⏰ 下次 Token 刷新时间: ${nextRefreshTime.toLocaleString('zh-CN')} (${Math.round(delay / 1000 / 60)} 分钟后)`);
      refreshTimer = setTimeout(backgroundRefreshToken, delay);
    }
  } catch (error) {
    logError('设置刷新定时器失败', error);
  }
}

// 同步初始化
(async () => {
  try {
    let BEARER_TOKEN;
    
    if (serverConfig.account.multiAccountEnabled) {
      // 多账号模式：选择最佳账号
      log('🔄 多账号模式已启用，正在选择最佳账号...');
      const result = await getBestAccountToken({
        strategy: serverConfig.account.strategy,
        bufferSeconds: serverConfig.token.refreshBufferMinutes * 60
      });
      BEARER_TOKEN = result.token;
      currentAccount = result.account;
      log(`✅ 已选择账号: ${currentAccount.email}`);
      log(`   用户ID: ${currentAccount.userId}`);
      log(`   使用率: ${(currentAccount.usage?.percentUsed * 100 || 0).toFixed(1)}%`);
      log(`   额度: ${currentAccount.usage?.current || 0}/${currentAccount.usage?.limit || 0}`);
    } else {
      // 单账号模式
      log('🔄 单账号模式，从 kiro-auth-token.json 加载...');
      BEARER_TOKEN = loadToken();
    }
    
    currentToken = BEARER_TOKEN;
    kiroClient = new KiroClient(BEARER_TOKEN, {
      maxSockets: serverConfig.connectionPool.maxSockets,
      maxFreeSockets: serverConfig.connectionPool.maxFreeSockets,
      socketTimeout: serverConfig.connectionPool.socketTimeout,
      timeout: serverConfig.connectionPool.requestTimeout
    });
    log('✅ Kiro 客户端初始化成功');
    
    // 检查是否需要立即刷新，否则设置定时器
    let needsRefreshNow = false;
    
    if (serverConfig.account.multiAccountEnabled) {
      needsRefreshNow = accountNeedsRefresh(currentAccount, serverConfig.token.refreshBufferMinutes * 60);
    } else {
      const tokenInfo = loadTokenInfo();
      needsRefreshNow = needsRefresh(tokenInfo, serverConfig.token.refreshBufferMinutes * 60);
    }
    
    if (needsRefreshNow) {
      log('⚠️ Token 已过期或即将过期，立即刷新');
      backgroundRefreshToken();
    } else {
      scheduleNextRefresh();
    }
  } catch (error) {
    logError('Kiro 客户端初始化失败', error);
    process.exit(1);
  }
})();

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
  
  claudeCodeLogger.write(logContent);
  
  // 保存完整的原始请求体到单独的 JSON 文件（异步写入）
  const fullRequestFile = path.join(LOGS_DIR, 'last-raw-request.json');
  fsPromises.writeFile(fullRequestFile, JSON.stringify(body, null, 2), 'utf8')
    .catch(err => console.error('写入 last-raw-request.json 失败:', err.message));
}

/**
 * 记录返回给 Claude Code 客户端的响应
 */
function logResponse(responseData, isStream = false) {
  const timestamp = new Date().toISOString();
  const separator = '-'.repeat(80);
  
  let logContent = `\n${separator}\n`;
  logContent += `[${timestamp}] 返回响应 (${isStream ? '流式' : '非流式'})\n`;
  logContent += `${separator}\n\n`;
  
  if (isStream) {
    // 流式响应概要
    logContent += `【流式响应概要】\n`;
    logContent += `Message ID: ${responseData.messageId}\n`;
    logContent += `Model: ${responseData.model}\n`;
    logContent += `Stop Reason: ${responseData.stopReason}\n`;
    logContent += `Tool Uses: ${responseData.toolUsesCount || 0}\n`;
    logContent += `Input Tokens: ${responseData.inputTokens || 0}\n`;
    logContent += `Output Tokens: ${responseData.outputTokens || 0}\n`;
    
    if (responseData.textContent) {
      logContent += `\n【文本内容】\n`;
      logContent += `${responseData.textContent}\n`;
    }
    
    if (responseData.toolUses && responseData.toolUses.length > 0) {
      logContent += `\n【工具调用】\n`;
      responseData.toolUses.forEach((tool, index) => {
        logContent += `  [${index}] ${tool.name} (${tool.id})\n`;
        const inputStr = JSON.stringify(tool.input);
        logContent += `      Input: ${inputStr.substring(0, 300)}${inputStr.length > 300 ? '...(截断)' : ''}\n`;
      });
    }
  } else {
    // 非流式响应
    logContent += `【响应概要】\n`;
    logContent += `ID: ${responseData.id}\n`;
    logContent += `Model: ${responseData.model}\n`;
    logContent += `Stop Reason: ${responseData.stop_reason}\n`;
    logContent += `Input Tokens: ${responseData.usage?.input_tokens || 0}\n`;
    logContent += `Output Tokens: ${responseData.usage?.output_tokens || 0}\n`;
    
    if (responseData.content && responseData.content.length > 0) {
      logContent += `\n【内容块】 (${responseData.content.length} 个)\n`;
      responseData.content.forEach((block, index) => {
        logContent += `  [${index}] Type: ${block.type}\n`;
        if (block.type === 'text') {
          logContent += `      Text: ${block.text || ''}\n`;
        } else if (block.type === 'tool_use') {
          logContent += `      Tool: ${block.name} (${block.id})\n`;
          const inputStr = JSON.stringify(block.input);
          logContent += `      Input: ${inputStr.substring(0, 300)}${inputStr.length > 300 ? '...(截断)' : ''}\n`;
        }
      });
    }
  }
  
  logContent += `\n${separator}\n`;
  
  claudeCodeLogger.write(logContent);
}

/**
 * 记录发送给 Kiro API 的请求
 */
function logKiroRequest(conversationState) {
  const timestamp = new Date().toISOString();
  const separator = '='.repeat(80);
  
  let logContent = `\n${separator}\n`;
  logContent += `[${timestamp}] Kiro API 请求\n`;
  logContent += `${separator}\n\n`;
  
  logContent += `【请求概要】\n`;
  logContent += `Conversation ID: ${conversationState.conversationId}\n`;
  logContent += `Agent Task Type: ${conversationState.agentTaskType}\n`;
  logContent += `Chat Trigger Type: ${conversationState.chatTriggerType}\n`;
  logContent += `History 数量: ${conversationState.history?.length || 0}\n`;
  
  const currentMsg = conversationState.currentMessage?.userInputMessage;
  if (currentMsg) {
    logContent += `\n【当前消息】\n`;
    logContent += `Model ID: ${currentMsg.modelId}\n`;
    logContent += `Origin: ${currentMsg.origin}\n`;
    logContent += `Content: ${currentMsg.content}\n`;
    
    if (currentMsg.images && currentMsg.images.length > 0) {
      logContent += `Images: ${currentMsg.images.length} 张\n`;
    }
    
    const ctx = currentMsg.userInputMessageContext;
    if (ctx) {
      if (ctx.tools && ctx.tools.length > 0) {
        logContent += `Tools: ${ctx.tools.length} 个\n`;
      }
      if (ctx.toolResults && ctx.toolResults.length > 0) {
        logContent += `Tool Results: ${ctx.toolResults.length} 个\n`;
        ctx.toolResults.forEach((tr, i) => {
          logContent += `  [${i}] ${tr.toolUseId} - ${tr.status}\n`;
        });
      }
    }
  }
  
  logContent += `\n${separator}\n`;
  
  kiroApiLogger.write(logContent);
}

/**
 * 记录 Kiro API 的响应
 */
function logKiroResponse(result, isStream = false) {
  const timestamp = new Date().toISOString();
  const separator = '-'.repeat(80);
  
  let logContent = `\n${separator}\n`;
  logContent += `[${timestamp}] Kiro API 响应 (${isStream ? '流式' : '非流式'})\n`;
  logContent += `${separator}\n\n`;
  
  logContent += `【响应概要】\n`;
  logContent += `Input Tokens: ${result.usage?.input_tokens || 0}\n`;
  logContent += `Output Tokens: ${result.usage?.output_tokens || 0}\n`;
  
  if (result.contextUsage) {
    logContent += `Context Usage: ${result.contextUsage.contextUsagePercentage}%\n`;
  }
  
  if (result.parsedContent) {
    if (result.parsedContent.text) {
      logContent += `\n【文本内容】\n`;
      logContent += `${result.parsedContent.text}\n`;
    }
    
    if (result.parsedContent.toolUses && result.parsedContent.toolUses.length > 0) {
      logContent += `\n【工具调用】 (${result.parsedContent.toolUses.length} 个)\n`;
      result.parsedContent.toolUses.forEach((tool, index) => {
        logContent += `  [${index}] ${tool.name} (${tool.id})\n`;
        logContent += `      Input: ${JSON.stringify(tool.input)}\n`;
      });
    }
  } else if (result.content) {
    logContent += `\n【原始内容】\n`;
    logContent += `${result.content}\n`;
  }
  
  logContent += `\n${separator}\n`;
  
  kiroApiLogger.write(logContent);
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
    fsPromises.writeFile(path.join(LOGS_DIR, 'conversationState-debug.json'), JSON.stringify(conversationState, null, 2), 'utf8')
      .catch(err => console.error('写入 conversationState-debug.json 失败:', err.message));

    // 非流式响应
    if (!stream) {
      // 记录 Kiro API 请求
      logKiroRequest(conversationState);
      
      let result;
      let retryCount = 0;
      // 计算最大重试次数：等于可用账号数量
      const maxRetries = getMaxRetries();
      
      if (maxRetries > 0) {
        log(`[重试配置] 可用账号数: ${maxRetries}, 将尝试所有账号直到成功`);
      }
      
      while (retryCount <= maxRetries) {
        try {
          result = await kiroClient.chat(userMessage, {
            modelId: kiroModelId,
            conversationId,
            history,
            tools: kiroTools.length > 0 ? kiroTools : undefined,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
            images: images.length > 0 ? images : undefined
          });
          
          // 请求成功，跳出循环
          break;
          
        } catch (error) {
          // 检查是否应该切换账号
          if (serverConfig.account.multiAccountEnabled && 
              serverConfig.account.autoSwitchOnError &&
              currentAccount && 
              shouldSwitchAccount(error) && 
              retryCount < maxRetries) {
            
            log(`⚠️ 检测到账号问题: ${error.message}`);
            log(`🔄 尝试切换账号 (已尝试 ${retryCount + 1}/${maxRetries + 1} 个账号)...`);
            
            // 切换到新账号
            const switchResult = await switchToNextAccount(currentAccount.id, serverConfig.account.strategy);
            
            if (switchResult) {
              // 切换成功，更新全局变量
              currentToken = switchResult.token;
              currentAccount = switchResult.account;
              
              // 重新创建客户端
              kiroClient = new KiroClient(currentToken, {
                maxSockets: serverConfig.connectionPool.maxSockets,
                maxFreeSockets: serverConfig.connectionPool.maxFreeSockets,
                socketTimeout: serverConfig.connectionPool.socketTimeout,
                timeout: serverConfig.connectionPool.requestTimeout
              });
              
              log(`✅ 已切换到账号: ${currentAccount.email}`);
              log(`   使用率: ${(currentAccount.usage?.percentUsed * 100 || 0).toFixed(1)}%`);
              
              // 重新设置刷新定时器
              scheduleNextRefresh();
              
              // 增加重试计数，继续循环
              retryCount++;
              continue;
            } else {
              // 切换失败（没有其他可用账号），抛出原始错误
              log(`❌ 无法切换账号，没有其他可用账号`);
              throw error;
            }
          } else {
            // 不应该切换账号，或者已达到最大重试次数，抛出错误
            if (retryCount >= maxRetries && maxRetries > 0) {
              log(`❌ 已尝试所有可用账号 (${maxRetries + 1} 个)，全部失败`);
            }
            throw error;
          }
        }
      }
      
      // 记录 Kiro API 响应
      logKiroResponse(result, false);

      log(`[响应] content 长度: ${result.content ? result.content.length : 0}`);

      const contentBlocks = [];
      if (result.parsedContent && result.parsedContent.text) {
        contentBlocks.push({ type: 'text', text: result.parsedContent.text });
      }
      if (result.parsedContent && result.parsedContent.toolUses && result.parsedContent.toolUses.length > 0) {
        contentBlocks.push(...result.parsedContent.toolUses);
      }

      const response = {
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
      };
      
      // 记录响应日志
      logResponse(response, false);
      
      return res.json(response);
    }

    // 流式响应
    // 注意：不要在这里设置 headers，等确认 API 调用成功后再设置
    // 这样如果 API 调用失败，还能返回 JSON 格式的错误

    const messageId = `msg_${uuidv4().replace(/-/g, '')}`;

    // 延迟发送开始事件，等收到第一个实际内容后再发
    let streamStarted = false;
    let textBlockStarted = false;  // 文本块是否已开始
    let textBlockEnded = false;
    let currentToolIndex = -1;  // 从 -1 开始，这样第一个工具是 0（如果没有文本块）
    let toolIndexMap = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    // 用于收集响应内容以记录日志
    let collectedTextContent = '';
    let collectedToolUses = [];

    // 发送流开始事件（只发送 message_start，不创建文本块）
    const ensureStreamStarted = () => {
      if (!streamStarted) {
        streamStarted = true;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        res.write(`event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: { id: messageId, type: 'message', role: 'assistant', content: [], model: model, usage: { input_tokens: 0, output_tokens: 0 } }
        })}\n\n`);
      }
    };
    
    // 确保文本块已开始（只在有实际文本内容时调用）
    const ensureTextBlockStarted = () => {
      ensureStreamStarted();
      if (!textBlockStarted) {
        textBlockStarted = true;
        currentToolIndex = 0;  // 文本块占用 index 0
        res.write(`event: content_block_start\ndata: ${JSON.stringify({
          type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' }
        })}\n\n`);
      }
    };

    // 记录 Kiro API 请求
    logKiroRequest(conversationState);

    // 流式响应的重试逻辑
    let result;
    let retryCount = 0;
    const maxRetries = getMaxRetries();
    
    if (maxRetries > 0) {
      log(`[流式重试配置] 可用账号数: ${maxRetries}, 将尝试所有账号直到成功`);
    }
    
    while (retryCount <= maxRetries) {
      try {
        result = await kiroClient.chat(userMessage, {
          modelId: kiroModelId,
          conversationId,
          history,
          tools: kiroTools.length > 0 ? kiroTools : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          images: images.length > 0 ? images : undefined,
          onChunk: (chunk) => {
            if (chunk.type === 'content') {
              // 有文本内容时才创建文本块
              ensureTextBlockStarted();
              
              // 收集文本内容用于日志
              collectedTextContent += chunk.data;
              
              // 将大块内容拆分成小块，模拟流式打字效果
              const text = chunk.data;
              const chunkSize = serverConfig.stream.chunkSize;
              for (let i = 0; i < text.length; i += chunkSize) {
                const smallChunk = text.slice(i, i + chunkSize);
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: smallChunk }
                })}\n\n`);
              }
            } else if (chunk.type === 'tool_use_start') {
              ensureStreamStarted();
              // 如果有文本块且未结束，先结束它
              if (textBlockStarted && !textBlockEnded) {
                res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
                textBlockEnded = true;
              }
              
              currentToolIndex++;
              toolIndexMap[chunk.toolUseId] = currentToolIndex;
              
              // 收集工具调用信息用于日志
              collectedToolUses.push({
                id: chunk.toolUseId,
                name: chunk.name,
                input: {},
                inputJson: ''
              });
              
              log(`[流式响应] 工具调用开始: ${chunk.name} (${chunk.toolUseId}) index=${currentToolIndex}`);
              
              res.write(`event: content_block_start\ndata: ${JSON.stringify({
                type: 'content_block_start',
                index: currentToolIndex,
                content_block: { type: 'tool_use', id: chunk.toolUseId, name: chunk.name, input: {} }
              })}\n\n`);
            } else if (chunk.type === 'tool_use_delta') {
              const toolIndex = toolIndexMap[chunk.toolUseId];
              if (toolIndex !== undefined && chunk.inputDelta) {
                // 收集工具输入用于日志
                const tool = collectedToolUses.find(t => t.id === chunk.toolUseId);
                if (tool) {
                  tool.inputJson += chunk.inputDelta;
                }
                
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta',
                  index: toolIndex,
                  delta: { type: 'input_json_delta', partial_json: chunk.inputDelta }
                })}\n\n`);
              }
            } else if (chunk.type === 'tool_use_stop') {
              const toolIndex = toolIndexMap[chunk.toolUseId];
              if (toolIndex !== undefined) {
                // 解析工具输入 JSON
                const tool = collectedToolUses.find(t => t.id === chunk.toolUseId);
                if (tool && tool.inputJson) {
                  try {
                    tool.input = JSON.parse(tool.inputJson);
                  } catch (e) {
                    tool.input = { _raw: tool.inputJson };
                  }
                }
                
                log(`[流式响应] 工具调用结束: ${chunk.name} index=${toolIndex}`);
                res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: toolIndex })}\n\n`);
              }
            }
          }
        });
        
        // 请求成功，跳出循环
        break;
        
      } catch (error) {
        // 检查是否应该切换账号
        // 注意：流式响应只能在流开始之前切换，一旦开始发送数据就无法切换了
        if (!streamStarted && 
            serverConfig.account.multiAccountEnabled && 
            serverConfig.account.autoSwitchOnError &&
            currentAccount && 
            shouldSwitchAccount(error) && 
            retryCount < maxRetries) {
          
          log(`⚠️ [流式] 检测到账号问题: ${error.message}`);
          log(`🔄 [流式] 尝试切换账号 (已尝试 ${retryCount + 1}/${maxRetries + 1} 个账号)...`);
          
          // 切换到新账号
          const switchResult = await switchToNextAccount(currentAccount.id, serverConfig.account.strategy);
          
          if (switchResult) {
            // 切换成功，更新全局变量
            currentToken = switchResult.token;
            currentAccount = switchResult.account;
            
            // 重新创建客户端
            kiroClient = new KiroClient(currentToken, {
              maxSockets: serverConfig.connectionPool.maxSockets,
              maxFreeSockets: serverConfig.connectionPool.maxFreeSockets,
              socketTimeout: serverConfig.connectionPool.socketTimeout,
              timeout: serverConfig.connectionPool.requestTimeout
            });
            
            log(`✅ [流式] 已切换到账号: ${currentAccount.email}`);
            log(`   使用率: ${(currentAccount.usage?.percentUsed * 100 || 0).toFixed(1)}%`);
            
            // 重新设置刷新定时器
            scheduleNextRefresh();
            
            // 增加重试计数，继续循环
            retryCount++;
            continue;
          } else {
            // 切换失败（没有其他可用账号），抛出原始错误
            log(`❌ [流式] 无法切换账号，没有其他可用账号`);
            throw error;
          }
        } else {
          // 不应该切换账号，或者已达到最大重试次数，或者流已经开始，抛出错误
          if (streamStarted) {
            log(`❌ [流式] 流已开始，无法切换账号`);
          } else if (retryCount >= maxRetries && maxRetries > 0) {
            log(`❌ [流式] 已尝试所有可用账号 (${maxRetries + 1} 个)，全部失败`);
          }
          throw error;
        }
      }
    }

    totalInputTokens = result.usage?.input_tokens || 0;
    totalOutputTokens = result.usage?.output_tokens || 0;
    
    // 记录 Kiro API 响应
    logKiroResponse(result, true);

    const hasToolUses = result.parsedContent && result.parsedContent.toolUses && result.parsedContent.toolUses.length > 0;
    
    // 如果流还没开始（没有任何内容），现在发送开始事件
    ensureStreamStarted();
    
    // 如果有文本块且未结束，结束它
    if (textBlockStarted && !textBlockEnded) {
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
    
    // 记录流式响应日志
    logResponse({
      messageId,
      model,
      stopReason: hasToolUses ? 'tool_use' : 'end_turn',
      textContent: collectedTextContent,
      toolUses: collectedToolUses,
      toolUsesCount: collectedToolUses.length,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    }, true);
    
    res.end();

  } catch (error) {
    logError('API 请求处理失败', error);
    if (!res.headersSent) {
      const formattedError = formatClaudeError(error);
      log(`[错误响应] 状态码: ${formattedError.status}, 类型: ${formattedError.body.error.type}, 消息: ${formattedError.body.error.message}`);
      res.status(formattedError.status).json(formattedError.body);
    } else {
      log(`[错误响应] headers 已发送，无法返回 JSON 错误`);
    }
  }
});

app.get('/health', (req, res) => {
  const poolStatus = kiroClient.getPoolStatus ? kiroClient.getPoolStatus() : null;
  res.json({ 
    status: 'ok', 
    service: 'kiro-claude-api',
    connectionPool: poolStatus
  });
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

const PORT = serverConfig.server.port;
const HOST = serverConfig.server.host;
const server = app.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  log(`🚀 Claude API 兼容服务器运行在 http://${HOST}:${PORT}`);
  log(`📝 API 端点: POST http://${displayHost}:${PORT}/v1/messages`);
  log(`📋 模型列表: GET http://${displayHost}:${PORT}/v1/models`);
  log(`🎨 Web 管理界面: http://${displayHost}:${PORT}`);
});

// 优雅关闭处理
async function gracefulShutdown(signal) {
  log(`\n📴 收到 ${signal} 信号，正在优雅关闭...`);
  
  // 清理 Token 刷新定时器
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    log('✅ Token 刷新定时器已清理');
  }
  
  // 销毁 KiroClient 连接池
  if (kiroClient && kiroClient.destroy) {
    kiroClient.destroy();
    log('✅ KiroClient 连接池已销毁');
  }
  
  // 关闭 HTTP 服务器
  server.close(async () => {
    log('✅ HTTP 服务器已关闭');
    
    // 关闭日志流，确保数据刷盘
    await Promise.all([
      mainLogger.close(),
      errorLogger.close(),
      claudeCodeLogger.close(),
      kiroApiLogger.close()
    ]);
    console.log('✅ 日志流已关闭');
    
    process.exit(0);
  });
  
  // 强制退出超时
  setTimeout(() => {
    console.warn('⚠️ 强制退出');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
