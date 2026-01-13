/**
 * 统一日志模块
 * 提供高性能的流式日志写入，支持多个日志通道
 *
 * 功能特性：
 * - 日志轮转（按大小和日期）
 * - 日志级别控制（DEBUG, INFO, WARN, ERROR）
 * - 高性能时间戳缓存
 * - 背压缓冲队列（丢弃消息写入备份文件）
 */

const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'server-config.json');

/**
 * 加载日志配置
 * @returns {{level: string, rotation: {maxSize: number, maxFiles: number}}}
 */
function loadLoggingConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.logging || { level: 'INFO', rotation: { maxSize: 10 * 1024 * 1024, maxFiles: 5 } };
  } catch {
    return { level: 'INFO', rotation: { maxSize: 10 * 1024 * 1024, maxFiles: 5 } };
  }
}

// 日志目录
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const ARCHIVE_DIR = path.join(LOGS_DIR, 'archive');

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

// 日志文件路径
const LOG_FILES = {
  main: path.join(LOGS_DIR, 'server-debug.log'),
  error: path.join(LOGS_DIR, 'server-error.log'),
  claudeCode: path.join(LOGS_DIR, 'claude-code.log'),
  kiroApi: path.join(LOGS_DIR, 'kiro-api.log'),
  kiroClient: path.join(LOGS_DIR, 'kiro-client-debug.log'),
  backpressure: path.join(LOGS_DIR, 'backpressure-buffer.log')
};

// ==================== 日志级别 ====================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

// 加载配置
const loggingConfig = loadLoggingConfig();

// 当前日志级别（从配置文件读取）
let currentLogLevel = LOG_LEVELS[loggingConfig.level?.toUpperCase()] ?? LOG_LEVELS.INFO;

// ==================== 请求追踪 ID ====================

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

// 使用 AsyncLocalStorage 在异步调用链中传递请求 ID
const requestContext = new AsyncLocalStorage();

/**
 * 生成唯一请求 ID
 * @returns {string} 8位十六进制字符串
 */
function generateRequestId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * 在请求上下文中运行函数
 * @param {Function} fn - 要执行的函数
 * @param {string} [requestId] - 可选的请求 ID，不提供则自动生成
 * @returns {*} 函数返回值
 */
function runWithRequestId(fn, requestId = null) {
  const id = requestId || generateRequestId();
  return requestContext.run({ requestId: id }, fn);
}

/**
 * 获取当前请求 ID
 * @returns {string|null}
 */
function getRequestId() {
  const store = requestContext.getStore();
  return store?.requestId || null;
}

/**
 * 设置当前请求 ID（用于中间件）
 * @param {string} requestId
 */
function setRequestId(requestId) {
  const store = requestContext.getStore();
  if (store) {
    store.requestId = requestId;
  }
}

/**
 * Express 中间件 - 自动为每个请求分配追踪 ID
 * @returns {Function} Express 中间件
 */
function requestIdMiddleware() {
  return (req, res, next) => {
    // 优先使用客户端传入的 ID，否则自动生成
    const requestId = req.headers['x-request-id'] || generateRequestId();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    runWithRequestId(() => next(), requestId);
  };
}

/**
 * 设置日志级别
 * @param {string|number} level - 日志级别名称或数值
 */
function setLogLevel(level) {
  if (typeof level === 'string') {
    const upperLevel = level.toUpperCase();
    if (LOG_LEVELS[upperLevel] !== undefined) {
      currentLogLevel = LOG_LEVELS[upperLevel];
    }
  } else if (typeof level === 'number' && level >= 0 && level <= 3) {
    currentLogLevel = level;
  }
}

/**
 * 获取当前日志级别
 * @returns {{level: number, name: string}}
 */
function getLogLevel() {
  return {
    level: currentLogLevel,
    name: LOG_LEVEL_NAMES[currentLogLevel]
  };
}

/**
 * 检查是否应该记录该级别的日志
 * @param {number} level - 日志级别
 * @returns {boolean}
 */
function shouldLog(level) {
  return level >= currentLogLevel;
}

// ==================== 时间戳缓存 ====================

let cachedTimestamp = '';
let cachedDateStr = '';
let lastTimestampSecond = 0;

/**
 * 获取缓存的时间戳（同一秒内复用）
 * @returns {string} ISO 格式时间戳
 */
function getTimestamp() {
  const now = Date.now();
  const currentSecond = Math.floor(now / 1000);

  if (currentSecond !== lastTimestampSecond) {
    const date = new Date(now);
    cachedTimestamp = date.toISOString();
    cachedDateStr = cachedTimestamp.slice(0, 10); // YYYY-MM-DD
    lastTimestampSecond = currentSecond;
  }

  return cachedTimestamp;
}

/**
 * 获取当前日期字符串（用于日志轮转）
 * @returns {string} YYYY-MM-DD 格式
 */
function getDateStr() {
  getTimestamp(); // 确保缓存已更新
  return cachedDateStr;
}

// ==================== 背压缓冲管理 ====================

/**
 * 背压缓冲写入器（单例）
 * 当主日志流背压时，消息写入此备份文件
 */
class BackpressureBuffer {
  constructor() {
    this.stream = null;
    this.initialized = false;
    this.messageCount = 0;
  }

  _ensureInitialized() {
    if (!this.initialized) {
      this.stream = fs.createWriteStream(LOG_FILES.backpressure, {
        flags: 'a',
        highWaterMark: 128 * 1024
      });
      this.stream.on('error', (err) => {
        console.error('[日志] 背压缓冲写入错误:', err.message);
      });
      this.initialized = true;
    }
  }

  /**
   * 写入背压消息
   * @param {string} channel - 原始通道名
   * @param {string} message - 日志消息
   */
  write(channel, message) {
    this._ensureInitialized();
    const timestamp = getTimestamp();
    const bufferedMessage = `[${timestamp}] [BACKPRESSURE] [${channel}] ${message}`;
    this.stream.write(bufferedMessage);
    this.messageCount++;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      messageCount: this.messageCount,
      filePath: LOG_FILES.backpressure
    };
  }

  /**
   * 关闭流
   */
  close() {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => {
          this.initialized = false;
          this.stream = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

const backpressureBuffer = new BackpressureBuffer();

// ==================== 日志轮转配置 ====================

const ROTATION_CONFIG = {
  maxSize: loggingConfig.rotation?.maxSize || 10 * 1024 * 1024,  // 默认 10MB
  maxFiles: loggingConfig.rotation?.maxFiles || 5                 // 默认保留5个归档文件
};

/**
 * 设置轮转配置
 * @param {{maxSize?: number, maxFiles?: number}} config
 */
function setRotationConfig(config) {
  if (config.maxSize) ROTATION_CONFIG.maxSize = config.maxSize;
  if (config.maxFiles) ROTATION_CONFIG.maxFiles = config.maxFiles;
}

// ==================== StreamLogger 类 ====================

/**
 * 基于 WriteStream 的日志类
 * 支持日志轮转、背压缓冲、懒初始化
 */
class StreamLogger {
  constructor(filePath, channelName) {
    this.filePath = filePath;
    this.channelName = channelName;
    this.stream = null;
    this.draining = false;
    this.initialized = false;
    this.currentSize = 0;
    this.currentDate = '';
  }

  /**
   * 创建写入流（内部方法）
   * @param {string} flags - 文件打开模式 ('w' 覆写, 'a' 追加)
   */
  _createStream(flags = 'a') {
    this.stream = fs.createWriteStream(this.filePath, {
      flags,
      highWaterMark: 64 * 1024
    });

    this.stream.on('drain', () => {
      this.draining = false;
    });

    this.stream.on('error', (err) => {
      console.error(`[日志] 写入流错误 (${this.filePath}):`, err.message);
    });

    // 获取当前文件大小
    try {
      const stats = fs.statSync(this.filePath);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }

    this.currentDate = getDateStr();
    this.initialized = true;
  }

  /**
   * 检查是否需要轮转
   * @returns {boolean}
   */
  _needsRotation() {
    // 按大小轮转
    if (this.currentSize >= ROTATION_CONFIG.maxSize) {
      return true;
    }
    // 按日期轮转
    const today = getDateStr();
    if (this.currentDate && this.currentDate !== today) {
      return true;
    }
    return false;
  }

  /**
   * 执行日志轮转（异步，确保流完全关闭后再操作文件）
   * @returns {Promise<void>}
   */
  async _rotate() {
    if (!this.stream) return;

    // 标记正在轮转，防止并发轮转
    if (this._rotating) return;
    this._rotating = true;

    try {
      // 等待流完全关闭（确保缓冲区数据刷盘）
      await new Promise((resolve, reject) => {
        this.stream.end((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.stream = null;
      this.initialized = false;

      // 生成归档文件名
      const basename = path.basename(this.filePath, '.log');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveName = `${basename}_${timestamp}.log`;
      const archivePath = path.join(ARCHIVE_DIR, archiveName);

      // 移动文件到归档目录
      try {
        fs.renameSync(this.filePath, archivePath);
      } catch (err) {
        console.error(`[日志] 轮转失败 (${this.filePath}):`, err.message);
      }

      // 清理旧归档文件
      this._cleanOldArchives(basename);

      // 重新创建流
      this._createStream('a');
    } finally {
      this._rotating = false;
    }
  }

  /**
   * 清理旧的归档文件
   * @param {string} basename - 日志文件基础名
   */
  _cleanOldArchives(basename) {
    try {
      const files = fs.readdirSync(ARCHIVE_DIR)
        .filter(f => f.startsWith(basename + '_') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(ARCHIVE_DIR, f),
          mtime: fs.statSync(path.join(ARCHIVE_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序

      // 删除超出数量限制的旧文件
      if (files.length > ROTATION_CONFIG.maxFiles) {
        const toDelete = files.slice(ROTATION_CONFIG.maxFiles);
        for (const file of toDelete) {
          fs.unlinkSync(file.path);
        }
      }
    } catch (err) {
      console.error(`[日志] 清理归档失败:`, err.message);
    }
  }

  /**
   * 初始化文件并创建写入流（覆写模式）
   * @param {string} content - 初始内容
   */
  initSync(content) {
    fs.writeFileSync(this.filePath, content, 'utf8');
    this._createStream('a');
    this.currentSize = Buffer.byteLength(content, 'utf8');
  }

  /**
   * 确保流已初始化（懒初始化，追加模式）
   */
  ensureInitialized() {
    if (!this.initialized) {
      this._createStream('a');
    }
  }

  /**
   * 写入日志消息（支持懒初始化、轮转、背压缓冲）
   * @param {string} message - 日志消息
   */
  write(message) {
    // 懒初始化
    this.ensureInitialized();

    // 检查是否需要轮转（异步执行，不阻塞写入）
    if (this._needsRotation() && !this._rotating) {
      this._rotate().catch(err => {
        console.error(`[日志] 轮转错误 (${this.filePath}):`, err.message);
      });
    }

    // 正在轮转或背压时：写入备份文件
    if (this._rotating || this.draining) {
      backpressureBuffer.write(this.channelName, message);
      return;
    }

    const ok = this.stream.write(message);
    if (!ok) {
      this.draining = true;
    }

    // 更新当前大小
    this.currentSize += Buffer.byteLength(message, 'utf8');
  }

  /**
   * 优雅关闭，确保数据刷盘
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => {
          this.initialized = false;
          this.stream = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// 创建各通道的日志实例
const loggers = {
  main: new StreamLogger(LOG_FILES.main, 'main'),
  error: new StreamLogger(LOG_FILES.error, 'error'),
  claudeCode: new StreamLogger(LOG_FILES.claudeCode, 'claudeCode'),
  kiroApi: new StreamLogger(LOG_FILES.kiroApi, 'kiroApi'),
  kiroClient: new StreamLogger(LOG_FILES.kiroClient, 'kiroClient')
};

/**
 * 初始化所有日志通道
 */
function initAll() {
  const timestamp = getTimestamp();
  loggers.main.initSync(`=== 服务器启动于 ${timestamp} ===\n\n`);
  loggers.error.initSync(`=== 错误日志启动于 ${timestamp} ===\n\n`);
  loggers.claudeCode.initSync(`=== Claude Code 请求/响应日志启动于 ${timestamp} ===\n\n`);
  loggers.kiroApi.initSync(`=== Kiro API 请求/响应日志启动于 ${timestamp} ===\n\n`);
  loggers.kiroClient.initSync(`=== Kiro Client 日志启动于 ${timestamp} ===\n\n`);
}

/**
 * 关闭所有日志通道
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<void>}
 */
async function closeAll(timeout = 5000) {
  const closePromise = Promise.all([
    loggers.main.close(),
    loggers.error.close(),
    loggers.claudeCode.close(),
    loggers.kiroApi.close(),
    loggers.kiroClient.close(),
    backpressureBuffer.close()
  ]);

  // 添加超时保护
  await Promise.race([
    closePromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('日志关闭超时')), timeout)
    )
  ]).catch(err => {
    console.error('[日志] 关闭警告:', err.message);
  });
}

// ==================== 便捷日志函数 ====================

/**
 * 格式化带请求 ID 的日志前缀
 * @param {string} levelName - 日志级别名称
 * @returns {string}
 */
function formatLogPrefix(levelName) {
  const timestamp = getTimestamp();
  const requestId = getRequestId();
  if (requestId) {
    return `[${timestamp}] [${levelName}] [${requestId}]`;
  }
  return `[${timestamp}] [${levelName}]`;
}

/**
 * 通用日志函数 - 输出到控制台和主日志文件
 * @param {string} message - 日志消息
 * @param {number} level - 日志级别（默认 INFO）
 */
function log(message, level = LOG_LEVELS.INFO) {
  if (!shouldLog(level)) return;

  const prefix = formatLogPrefix(LOG_LEVEL_NAMES[level]);
  const logMessage = `${prefix} ${message}\n`;
  console.log(message);
  loggers.main.write(logMessage);
}

/**
 * 调试日志
 * @param {string} message - 日志消息
 */
function logDebug(message) {
  log(message, LOG_LEVELS.DEBUG);
}

/**
 * 信息日志
 * @param {string} message - 日志消息
 */
function logInfo(message) {
  log(message, LOG_LEVELS.INFO);
}

/**
 * 记录对象日志
 * @param {string} label - 标签
 * @param {any} obj - 要记录的对象
 * @param {number} maxLength - 最大序列化长度（默认 50KB）
 */
function logObject(label, obj, maxLength = 50 * 1024) {
  let jsonStr;
  try {
    jsonStr = JSON.stringify(obj, null, 2);
    if (jsonStr.length > maxLength) {
      jsonStr = jsonStr.slice(0, maxLength) + '\n... [截断，原始长度: ' + jsonStr.length + ']';
    }
  } catch (err) {
    jsonStr = `[序列化失败: ${err.message}]`;
  }
  const message = `${label}:\n${jsonStr}`;
  log(message, LOG_LEVELS.INFO);
}

/**
 * 警告日志函数 - 输出到控制台和主日志文件
 * @param {string} message - 警告消息
 */
function logWarn(message) {
  if (!shouldLog(LOG_LEVELS.WARN)) return;

  const prefix = formatLogPrefix('WARN');
  const logMessage = `${prefix} ${message}\n`;
  console.warn(message);
  loggers.main.write(logMessage);
}

/**
 * 错误日志函数 - 同时输出到错误日志和主日志
 * @param {string} message - 错误消息
 * @param {Error|null} error - 错误对象
 */
function logError(message, error = null) {
  // 错误日志始终记录，不受级别限制
  const prefix = formatLogPrefix('ERROR');
  let errorMessage = `${prefix} ${message}\n`;
  if (error) {
    errorMessage += `错误详情: ${error.message}\n`;
    if (error.stack) {
      errorMessage += `堆栈跟踪:\n${error.stack}\n`;
    }
  }
  errorMessage += '\n';
  console.error(message);
  if (error) console.error('错误详情:', error.message);
  loggers.error.write(errorMessage);
  loggers.main.write(errorMessage);
}

/**
 * Kiro Client 专用日志函数
 * @param {string} message - 完整日志消息
 * @param {string|null} consoleMessage - 控制台显示的简短消息
 */
function logKiroClient(message, consoleMessage = null) {
  if (!shouldLog(LOG_LEVELS.INFO)) return;

  const prefix = formatLogPrefix('INFO');
  const logMessage = `${prefix} ${message}\n`;
  loggers.kiroClient.write(logMessage);

  if (consoleMessage !== null) {
    console.log(consoleMessage);
  } else {
    const shortMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;
    console.log(`[Kiro] ${shortMessage}`);
  }
}

/**
 * Kiro Client 错误日志函数 - 文件记录详细，控制台简短
 * @param {string} message - 简短错误描述
 * @param {string|object} details - 详细错误信息（会完整写入文件）
 */
function logKiroClientError(message, details = null) {
  const prefix = formatLogPrefix('ERROR');
  let logMessage = `${prefix} ${message}\n`;

  if (details) {
    let detailStr;
    try {
      detailStr = typeof details === 'object' ? JSON.stringify(details, null, 2) : details;
    } catch {
      detailStr = String(details);
    }
    logMessage += `详细信息:\n${detailStr}\n`;
  }
  logMessage += '\n';

  // 文件记录完整信息
  loggers.kiroClient.write(logMessage);
  // 同时写入错误日志
  loggers.error.write(logMessage);

  // 控制台只显示简短信息
  console.error(`[Kiro] ${message}`);
}

/**
 * Kiro Client 调试日志函数 - 仅写入文件，不输出到控制台
 * @param {string} message - 调试消息
 * @param {any} data - 调试数据
 */
function logKiroClientDebug(message, data = null) {
  if (!shouldLog(LOG_LEVELS.DEBUG)) return;

  const prefix = formatLogPrefix('DEBUG');
  let logMessage = `${prefix} ${message}\n`;

  if (data) {
    let dataStr;
    try {
      dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    } catch {
      dataStr = String(data);
    }
    logMessage += `${dataStr}\n`;
  }

  // 仅写入文件，不输出到控制台
  loggers.kiroClient.write(logMessage);
}

/**
 * 手动触发日志轮转（所有通道）
 */
function rotateAll() {
  for (const logger of Object.values(loggers)) {
    if (logger._needsRotation()) {
      logger._rotate();
    }
  }
}

/**
 * 获取日志系统状态
 */
function getStatus() {
  const status = {
    logLevel: getLogLevel(),
    rotation: ROTATION_CONFIG,
    backpressure: backpressureBuffer.getStats(),
    channels: {}
  };

  for (const [name, logger] of Object.entries(loggers)) {
    status.channels[name] = {
      filePath: logger.filePath,
      currentSize: logger.currentSize,
      initialized: logger.initialized,
      draining: logger.draining
    };
  }

  return status;
}

module.exports = {
  // 日志实例（底层访问）
  loggers,

  // 日志文件路径
  LOG_FILES,
  LOGS_DIR,
  ARCHIVE_DIR,

  // 日志级别
  LOG_LEVELS,
  setLogLevel,
  getLogLevel,

  // 请求追踪 ID
  generateRequestId,
  runWithRequestId,
  getRequestId,
  setRequestId,
  requestIdMiddleware,

  // 轮转配置
  setRotationConfig,
  rotateAll,

  // 生命周期
  initAll,
  closeAll,

  // 状态查询
  getStatus,

  // 便捷日志函数
  log,
  logDebug,
  logInfo,
  logObject,
  logWarn,
  logError,
  logKiroClient,
  logKiroClientError,
  logKiroClientDebug,

  // 工具函数
  getTimestamp,

  // StreamLogger 类（供特殊用途）
  StreamLogger
};
