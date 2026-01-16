/**
 * 配置文件热重载模块
 * 监听配置文件变化并自动重新加载
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { log, logWarn, logError } = require('./logger');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

// 配置文件列表
const CONFIG_FILES = {
  server: 'server-config.json',
  models: 'model-mapping.json',
  accounts: 'kiro-accounts.json'
};

// 默认配置
const DEFAULT_CONFIGS = {
  server: {
    server: { host: '0.0.0.0', port: 3000 },
    stream: { chunkSize: 4 },
    token: { refreshRetryMax: 3, refreshRetryIntervalMs: 60000, refreshBufferMinutes: 5 },
    connectionPool: { maxSockets: 20, maxFreeSockets: 10, socketTimeout: 60000, requestTimeout: 30000 },
    account: { strategy: 'auto', autoSwitchOnError: true },
    logging: { level: 'INFO', rotation: { maxSize: 10485760, maxFiles: 5 } }
  },
  models: {
    defaultModel: 'claude-sonnet-4.5',
    mappings: {
      'claude-sonnet-4.5': 'claude-sonnet-4.5',
      'claude-haiku-4.5': 'claude-haiku-4.5',
      'claude-opus-4.5': 'claude-opus-4.5'
    }
  }
};

class ConfigWatcher extends EventEmitter {
  constructor() {
    super();
    this.configs = {};
    this.watchers = {};
    this.debounceTimers = {};
    this.debounceMs = 500; // 防抖延迟
    this.lastModified = {};
  }

  /**
   * 加载单个配置文件
   */
  loadConfig(configKey) {
    const filename = CONFIG_FILES[configKey];
    const filepath = path.join(CONFIG_DIR, filename);

    try {
      if (!fs.existsSync(filepath)) {
        if (DEFAULT_CONFIGS[configKey]) {
          this.configs[configKey] = { ...DEFAULT_CONFIGS[configKey] };
          logWarn(`配置文件不存在，使用默认值: ${filename}`);
        }
        return this.configs[configKey];
      }

      const content = fs.readFileSync(filepath, 'utf8');
      const parsed = JSON.parse(content);
      
      // 合并默认配置
      if (DEFAULT_CONFIGS[configKey]) {
        this.configs[configKey] = this.deepMerge(DEFAULT_CONFIGS[configKey], parsed);
      } else {
        this.configs[configKey] = parsed;
      }

      return this.configs[configKey];
    } catch (error) {
      logError(`加载配置文件失败: ${filename}`, error);
      if (DEFAULT_CONFIGS[configKey]) {
        this.configs[configKey] = { ...DEFAULT_CONFIGS[configKey] };
      }
      return this.configs[configKey];
    }
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * 加载所有配置
   */
  loadAll() {
    for (const key of Object.keys(CONFIG_FILES)) {
      this.loadConfig(key);
    }
    log('✅ 所有配置文件已加载');
    return this.configs;
  }

  /**
   * 开始监听配置文件变化
   */
  startWatching() {
    for (const [key, filename] of Object.entries(CONFIG_FILES)) {
      this.watchFile(key, filename);
    }
    log('👀 配置文件监听已启动');
  }

  /**
   * 监听单个文件
   */
  watchFile(configKey, filename) {
    const filepath = path.join(CONFIG_DIR, filename);

    // 如果已有 watcher，先关闭
    if (this.watchers[configKey]) {
      this.watchers[configKey].close();
    }

    try {
      // 记录初始修改时间
      if (fs.existsSync(filepath)) {
        this.lastModified[configKey] = fs.statSync(filepath).mtimeMs;
      }

      this.watchers[configKey] = fs.watch(filepath, (eventType) => {
        if (eventType === 'change') {
          this.handleFileChange(configKey, filename, filepath);
        }
      });

      this.watchers[configKey].on('error', (error) => {
        logError(`监听配置文件出错: ${filename}`, error);
        // 尝试重新监听
        setTimeout(() => this.watchFile(configKey, filename), 5000);
      });
    } catch (error) {
      // 文件可能不存在，监听目录
      logWarn(`无法监听文件 ${filename}，将监听目录变化`);
    }
  }

  /**
   * 处理文件变化（带防抖）
   */
  handleFileChange(configKey, filename, filepath) {
    // 清除之前的定时器
    if (this.debounceTimers[configKey]) {
      clearTimeout(this.debounceTimers[configKey]);
    }

    this.debounceTimers[configKey] = setTimeout(() => {
      // 检查文件是否真的被修改（避免重复触发）
      try {
        if (!fs.existsSync(filepath)) return;
        
        const currentMtime = fs.statSync(filepath).mtimeMs;
        if (currentMtime === this.lastModified[configKey]) {
          return; // 没有实际变化
        }
        this.lastModified[configKey] = currentMtime;
      } catch (e) {
        return;
      }

      log(`🔄 检测到配置文件变化: ${filename}`);
      
      // 深拷贝旧配置
      const oldConfig = this.configs[configKey] ? JSON.parse(JSON.stringify(this.configs[configKey])) : null;
      const newConfig = this.loadConfig(configKey);

      if (newConfig) {
        log(`✅ 配置已热重载: ${filename}`);
        this.emit('configChanged', {
          key: configKey,
          filename,
          oldConfig,
          newConfig,
          changes: this.getChanges(oldConfig, newConfig)
        });
      }
    }, this.debounceMs);
  }

  /**
   * 获取配置变化的字段
   */
  getChanges(oldConfig, newConfig, prefix = '') {
    const changes = [];
    
    if (!oldConfig) {
      return [{ path: prefix || 'root', type: 'added', newValue: newConfig }];
    }

    const allKeys = new Set([...Object.keys(oldConfig || {}), ...Object.keys(newConfig || {})]);
    
    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const oldVal = oldConfig?.[key];
      const newVal = newConfig?.[key];

      if (oldVal === undefined && newVal !== undefined) {
        changes.push({ path, type: 'added', newValue: newVal });
      } else if (oldVal !== undefined && newVal === undefined) {
        changes.push({ path, type: 'removed', oldValue: oldVal });
      } else if (typeof oldVal === 'object' && typeof newVal === 'object' && !Array.isArray(oldVal)) {
        changes.push(...this.getChanges(oldVal, newVal, path));
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ path, type: 'changed', oldValue: oldVal, newValue: newVal });
      }
    }

    return changes;
  }

  /**
   * 获取配置
   */
  get(configKey) {
    return this.configs[configKey];
  }

  /**
   * 手动重载配置
   */
  reload(configKey) {
    if (configKey) {
      // 深拷贝旧配置
      const oldConfig = this.configs[configKey] ? JSON.parse(JSON.stringify(this.configs[configKey])) : null;
      const newConfig = this.loadConfig(configKey);
      
      this.emit('configChanged', {
        key: configKey,
        filename: CONFIG_FILES[configKey],
        oldConfig,
        newConfig,
        changes: this.getChanges(oldConfig, newConfig),
        manual: true
      });
      
      return newConfig;
    } else {
      // 重载所有配置
      const results = {};
      for (const key of Object.keys(CONFIG_FILES)) {
        results[key] = this.reload(key);
      }
      return results;
    }
  }

  /**
   * 停止监听
   */
  stopWatching() {
    for (const [key, watcher] of Object.entries(this.watchers)) {
      if (watcher) {
        watcher.close();
        delete this.watchers[key];
      }
    }
    
    for (const timer of Object.values(this.debounceTimers)) {
      clearTimeout(timer);
    }
    this.debounceTimers = {};
    
    log('🛑 配置文件监听已停止');
  }

  /**
   * 获取监听状态
   */
  getStatus() {
    return {
      watching: Object.keys(this.watchers).length > 0,
      configs: Object.keys(this.configs),
      files: CONFIG_FILES,
      lastModified: this.lastModified
    };
  }
}

// 单例
const configWatcher = new ConfigWatcher();

module.exports = {
  configWatcher,
  CONFIG_FILES,
  DEFAULT_CONFIGS
};
