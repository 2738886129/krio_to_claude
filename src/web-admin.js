const express = require('express');
const fs = require('fs');
const path = require('path');
const { refreshAccountToken, markAccountError } = require('./loadMultiAccount');
const KiroClient = require('./KiroClient');
const { log, LOGS_DIR, LOG_LEVELS, setLogLevel, getLogLevel, setRotationConfig, getStatus, rotateAll } = require('./logger');
const { configWatcher, CONFIG_FILES } = require('./configWatcher');

const router = express.Router();

// 配置文件路径
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// 获取账号列表
router.get('/api/accounts', (req, res) => {
  try {
    const accountsFile = path.join(CONFIG_DIR, 'kiro-accounts.json');
    
    if (!fs.existsSync(accountsFile)) {
      return res.json({ accounts: [] });
    }

    const data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取服务器配置
router.get('/api/config', (req, res) => {
  try {
    const configFile = path.join(CONFIG_DIR, 'server-config.json');
    
    if (!fs.existsSync(configFile)) {
      return res.json({
        server: { host: '0.0.0.0', port: 3000 },
        stream: { chunkSize: 4 },
        token: { refreshRetryMax: 3, refreshRetryIntervalMs: 60000, refreshBufferMinutes: 5 },
        connectionPool: { maxSockets: 20, maxFreeSockets: 10, socketTimeout: 60000, requestTimeout: 30000 },
        account: { strategy: 'auto', autoSwitchOnError: true }
      });
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 上传账号配置
router.post('/api/auth-config/accounts', (req, res) => {
  try {
    const accountsData = req.body;
    
    if (!accountsData || !accountsData.accounts || !Array.isArray(accountsData.accounts)) {
      return res.status(400).json({ error: '无效的账号配置格式' });
    }
    
    if (accountsData.accounts.length === 0) {
      return res.status(400).json({ error: '账号列表不能为空' });
    }
    
    const accountsFile = path.join(CONFIG_DIR, 'kiro-accounts.json');
    fs.writeFileSync(accountsFile, JSON.stringify(accountsData, null, 2), 'utf8');
    log(`✅ 多账号配置已保存，共 ${accountsData.accounts.length} 个账号`);
    
    // 触发热重载
    configWatcher.reload('accounts');
    
    res.json({ 
      success: true, 
      message: `多账号配置已保存，共 ${accountsData.accounts.length} 个账号` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 上传账号配置（别名）
router.post('/api/auth-config/multi', (req, res) => {
  try {
    const accountsData = req.body;
    
    if (!accountsData || !accountsData.accounts || !Array.isArray(accountsData.accounts)) {
      return res.status(400).json({ error: '无效的账号配置格式' });
    }
    
    if (accountsData.accounts.length === 0) {
      return res.status(400).json({ error: '账号列表不能为空' });
    }
    
    const accountsFile = path.join(CONFIG_DIR, 'kiro-accounts.json');
    fs.writeFileSync(accountsFile, JSON.stringify(accountsData, null, 2), 'utf8');
    log(`✅ 账号配置已保存，共 ${accountsData.accounts.length} 个账号`);
    
    // 触发热重载
    configWatcher.reload('accounts');
    
    res.json({ 
      success: true, 
      message: `账号配置已保存，共 ${accountsData.accounts.length} 个账号` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取认证配置状态
router.get('/api/auth-config/status', (req, res) => {
  try {
    const accountsFile = path.join(CONFIG_DIR, 'kiro-accounts.json');
    
    let multiAccountStatus = { valid: false, count: 0, activeCount: 0 };
    
    if (fs.existsSync(accountsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
        if (data.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
          multiAccountStatus.valid = true;
          multiAccountStatus.count = data.accounts.length;
          multiAccountStatus.activeCount = data.accounts.filter(acc => acc.status === 'active').length;
        }
      } catch (e) {
        // 解析失败
      }
    }
    
    res.json({
      multiAccount: multiAccountStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 重启服务器
router.post('/api/server/restart', (req, res) => {
  log('🔄 收到重启请求，服务器将在 1 秒后重启...');
  res.json({ success: true, message: '服务器正在重启...' });
  
  // 延迟重启，让响应先发送出去
  setTimeout(() => {
    log('🔄 正在重启服务器...');
    process.exit(0); // 退出码 0，让守护进程重启
  }, 1000);
});

// 获取模型映射
router.get('/api/models', (req, res) => {
  try {
    const modelsFile = path.join(CONFIG_DIR, 'model-mapping.json');
    
    if (!fs.existsSync(modelsFile)) {
      return res.json({
        defaultModel: 'claude-sonnet-4.5',
        mappings: {}
      });
    }

    const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取日志内容
router.get('/api/logs/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 安全检查：只允许访问特定的日志文件
    const allowedLogs = [
      'server-debug.log',
      'server-error.log',
      'claude-code.log',
      'kiro-api.log'
    ];

    if (!allowedLogs.includes(filename)) {
      return res.status(403).json({ error: '不允许访问此文件' });
    }

    const logFile = path.join(LOGS_DIR, filename);

    if (!fs.existsSync(logFile)) {
      return res.send('');
    }

    // 读取最后 50KB 的日志内容
    const stats = fs.statSync(logFile);
    const fileSize = stats.size;
    const maxSize = 50 * 1024; // 50KB

    let content;
    if (fileSize > maxSize) {
      // 只读取最后 50KB
      const buffer = Buffer.alloc(maxSize);
      const fd = fs.openSync(logFile, 'r');
      fs.readSync(fd, buffer, 0, maxSize, fileSize - maxSize);
      fs.closeSync(fd);
      content = buffer.toString('utf8');
    } else {
      content = fs.readFileSync(logFile, 'utf8');
    }

    res.type('text/plain').send(content);
  } catch (error) {
    res.status(500).send(`读取日志失败: ${error.message}`);
  }
});

// 健康检查
router.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ==================== 日志管理 API ====================

// 获取日志系统状态
router.get('/api/logger/status', (req, res) => {
  try {
    const status = getStatus();
    status.availableLevels = Object.keys(LOG_LEVELS);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 设置日志级别
router.post('/api/logger/level', (req, res) => {
  try {
    const { level } = req.body;
    if (!level) {
      return res.status(400).json({ error: '缺少 level 参数' });
    }

    const upperLevel = String(level).toUpperCase();
    if (LOG_LEVELS[upperLevel] === undefined) {
      return res.status(400).json({
        error: `无效的日志级别: ${level}`,
        validLevels: Object.keys(LOG_LEVELS)
      });
    }

    setLogLevel(upperLevel);
    const newLevel = getLogLevel();
    log(`日志级别已更改为: ${newLevel.name}`);
    res.json({ success: true, level: newLevel });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 设置日志轮转配置
router.post('/api/logger/rotation', (req, res) => {
  try {
    const { maxSize, maxFiles } = req.body;
    const config = {};

    if (maxSize !== undefined) {
      const size = parseInt(maxSize, 10);
      if (isNaN(size) || size < 1024 * 1024) {
        return res.status(400).json({ error: 'maxSize 至少为 1MB (1048576 字节)' });
      }
      config.maxSize = size;
    }

    if (maxFiles !== undefined) {
      const files = parseInt(maxFiles, 10);
      if (isNaN(files) || files < 1 || files > 100) {
        return res.status(400).json({ error: 'maxFiles 必须在 1-100 之间' });
      }
      config.maxFiles = files;
    }

    if (Object.keys(config).length === 0) {
      return res.status(400).json({ error: '需要提供 maxSize 或 maxFiles 参数' });
    }

    setRotationConfig(config);
    const status = getStatus();
    log(`日志轮转配置已更新: ${JSON.stringify(status.rotation)}`);
    res.json({ success: true, rotation: status.rotation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动触发日志轮转
router.post('/api/logger/rotate', (req, res) => {
  try {
    rotateAll();
    log('手动触发日志轮转完成');
    res.json({ success: true, message: '日志轮转已触发' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 配置热重载 API ====================

// 获取热重载状态
router.get('/api/config/hot-reload/status', (req, res) => {
  try {
    const status = configWatcher.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动触发配置重载
router.post('/api/config/hot-reload', (req, res) => {
  try {
    const { configKey } = req.body;
    
    if (configKey && !CONFIG_FILES[configKey]) {
      return res.status(400).json({
        error: `无效的配置类型: ${configKey}`,
        validKeys: Object.keys(CONFIG_FILES)
      });
    }

    const result = configWatcher.reload(configKey);
    log(`🔄 手动触发配置重载: ${configKey || '全部'}`);
    
    res.json({
      success: true,
      message: configKey ? `配置 ${configKey} 已重载` : '所有配置已重载',
      config: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动配置监听
router.post('/api/config/hot-reload/start', (req, res) => {
  try {
    configWatcher.startWatching();
    res.json({ success: true, message: '配置监听已启动' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 停止配置监听
router.post('/api/config/hot-reload/stop', (req, res) => {
  try {
    configWatcher.stopWatching();
    res.json({ success: true, message: '配置监听已停止' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 测试账号可用性（发送模拟请求验证账号是否可用）
router.post('/api/accounts/:accountId/test', async (req, res) => {
  const accountId = req.params.accountId;
  
  log(`🧪 开始测试账号可用性: ${accountId}`);
  
  try {
    // 读取账号信息
    const accountsFile = path.join(CONFIG_DIR, 'kiro-accounts.json');
    if (!fs.existsSync(accountsFile)) {
      return res.json({ success: false, error: '账号配置文件不存在' });
    }
    
    const data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    const account = data.accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.json({ success: false, error: '账号不存在' });
    }
    
    if (!account.credentials?.accessToken) {
      return res.json({ success: false, error: '账号缺少 accessToken' });
    }
    
    // 创建测试客户端
    const testClient = new KiroClient(account.credentials.accessToken, {
      timeout: 20000  // 20秒超时
    });
    
    const startTime = Date.now();
    
    // 发送简单的测试消息
    await testClient.chat('hi', {
      modelId: 'claude-haiku-4.5'  // 使用最快的模型
    });
    
    const responseTime = Date.now() - startTime;
    
    log(`✅ 账号测试成功: ${account.email || accountId}, 响应时间: ${responseTime}ms`);
    
    res.json({ 
      success: true, 
      message: '账号可用',
      responseTime,
      account: {
        id: account.id,
        email: account.email
      }
    });
  } catch (error) {
    log(`❌ 账号测试失败: ${accountId} - ${error.message}`);
    
    // 标记账号为错误状态
    markAccountError(accountId, `测试失败: ${error.message}`);
    
    res.json({ 
      success: false, 
      error: error.message,
      account: { id: accountId }
    });
  }
});

// 添加单个账号
router.post('/api/accounts', async (req, res) => {
  log(`➕ 添加账号请求`);
  
  try {
    const credentials = req.body;
    
    // 验证必要字段
    if (!credentials.accessToken || !credentials.refreshToken) {
      return res.status(400).json({ error: '缺少必要的凭证信息 (accessToken, refreshToken)' });
    }
    
    const accountsFile = path.join(CONFIG_DIR, 'kiro-accounts.json');
    let data = { version: '1.0.0', accounts: [], groups: [], tags: [] };
    
    if (fs.existsSync(accountsFile)) {
      data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    }
    
    // 生成账号序号
    const accountIndex = data.accounts.length + 1;
    const defaultName = `账号-${accountIndex}`;
    
    // 生成新账号
    const newAccount = {
      email: credentials.email || defaultName,
      userId: '',
      nickname: credentials.email ? credentials.email.split('@')[0] : defaultName,
      idp: credentials.provider || 'Google',
      credentials: {
        accessToken: credentials.accessToken,
        csrfToken: '',
        refreshToken: credentials.refreshToken,
        clientId: '',
        clientSecret: '',
        region: credentials.region || 'us-east-1',
        expiresAt: credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : Date.now() + 3600000,
        authMethod: credentials.authMethod || 'social',
        provider: credentials.provider || 'Google'
      },
      subscription: {
        type: 'Unknown',
        title: 'UNKNOWN',
        rawType: '',
        daysRemaining: 0,
        expiresAt: 0
      },
      usage: {
        current: 0,
        limit: 0,
        percentUsed: 0,
        lastUpdated: Date.now()
      },
      tags: [],
      status: 'active',
      lastUsedAt: 0,
      id: require('crypto').randomUUID(),
      createdAt: Date.now(),
      lastCheckedAt: 0
    };
    
    // 尝试获取账号信息
    try {
      const kiroClient = new KiroClient(newAccount.credentials.accessToken);
      
      // 获取用户资料（邮箱等）
      try {
        const userInfo = await kiroClient.getUserInfo();
        if (userInfo) {
          newAccount.email = userInfo.email || newAccount.email;
          newAccount.userId = userInfo.userId || '';
          newAccount.nickname = userInfo.email ? userInfo.email.split('@')[0] : newAccount.nickname;
          newAccount.idp = userInfo.idp || newAccount.idp;
        }
      } catch (profileErr) {
        log(`⚠️ 获取用户资料失败: ${profileErr.message}`);
      }
      
      // 获取额度信息
      const usageData = await kiroClient.getUsageLimits();
      
      if (usageData) {
        // 如果没有从 profile 获取到，尝试从 usageData 获取
        if (!newAccount.userId && usageData.userInfo) {
          newAccount.userId = usageData.userInfo.userId || '';
        }
        
        // 提取订阅信息
        if (usageData.subscriptionInfo) {
          const sub = usageData.subscriptionInfo;
          const typeMap = {
            'Q_DEVELOPER_STANDALONE_FREE': 'Free',
            'Q_DEVELOPER_STANDALONE_PRO': 'Pro',
            'KIRO_FREE': 'Free',
            'KIRO_PRO': 'Pro'
          };
          
          // 计算剩余天数：从 usageBreakdownList 或顶层获取 nextDateReset
          let daysRemaining = 0;
          const nextReset = usageData.usageBreakdownList?.[0]?.nextDateReset || usageData.nextDateReset;
          if (nextReset) {
            const resetDate = new Date(nextReset * 1000);
            const now = new Date();
            daysRemaining = Math.max(0, Math.ceil((resetDate - now) / (1000 * 60 * 60 * 24)));
          }
          
          newAccount.subscription = {
            type: typeMap[sub.type] || sub.type || 'Unknown',
            title: sub.subscriptionTitle || 'UNKNOWN',
            rawType: sub.type || '',
            daysRemaining: daysRemaining,
            expiresAt: nextReset ? nextReset * 1000 : 0,
            managementTarget: sub.subscriptionManagementTarget || '',
            upgradeCapability: sub.upgradeCapability || '',
            overageCapability: sub.overageCapability || ''
          };
        }
        
        // 提取使用量信息
        if (usageData.usageBreakdownList && usageData.usageBreakdownList.length > 0) {
          const breakdown = usageData.usageBreakdownList[0];
          const trialInfo = breakdown.freeTrialInfo || {};
          
          const baseLimit = breakdown.usageLimit || 0;
          const baseCurrent = breakdown.currentUsage || 0;
          const trialLimit = trialInfo.usageLimit || 0;
          const trialCurrent = trialInfo.currentUsage || 0;
          
          const totalLimit = baseLimit + trialLimit;
          const totalCurrent = baseCurrent + trialCurrent;
          
          newAccount.usage = {
            current: totalCurrent,
            limit: totalLimit,
            percentUsed: totalLimit > 0 ? (totalCurrent / totalLimit) : 0,
            lastUpdated: Date.now(),
            baseLimit: baseLimit,
            baseCurrent: baseCurrent,
            freeTrialLimit: trialLimit,
            freeTrialCurrent: trialCurrent,
            freeTrialExpiry: trialInfo.freeTrialExpiry ? new Date(trialInfo.freeTrialExpiry * 1000).toISOString() : '',
            nextResetDate: breakdown.nextDateReset ? new Date(breakdown.nextDateReset * 1000).toISOString() : ''
          };
        }
      }
      
      newAccount.lastCheckedAt = Date.now();
      log(`✅ 成功获取账号信息: ${newAccount.email || newAccount.userId}, 额度: ${newAccount.usage.current}/${newAccount.usage.limit}`);
    } catch (err) {
      log(`⚠️ 获取账号信息失败，使用默认值: ${err.message}`);
    }
    
    // 检查是否已存在相同账号
    const existingIndex = data.accounts.findIndex(acc => 
      acc.credentials?.accessToken === credentials.accessToken
    );
    
    if (existingIndex !== -1) {
      return res.status(400).json({ error: '该账号已存在' });
    }
    
    data.accounts.push(newAccount);
    fs.writeFileSync(accountsFile, JSON.stringify(data, null, 2), 'utf8');
    
    log(`✅ 账号已添加: ${newAccount.email || newAccount.id}`);
    
    // 触发热重载
    configWatcher.reload('accounts');
    
    res.json({
      success: true,
      message: `账号已添加${newAccount.email ? ': ' + newAccount.email : ''}`,
      account: {
        id: newAccount.id,
        email: newAccount.email,
        status: newAccount.status,
        usage: newAccount.usage
      }
    });
  } catch (error) {
    log(`❌ 添加账号失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 删除账号
router.delete('/api/accounts/:accountId', (req, res) => {
  const accountId = req.params.accountId;
  
  log(`🗑️ 删除账号请求: ${accountId}`);
  
  try {
    const accountsFile = path.join(CONFIG_DIR, 'kiro-accounts.json');
    
    if (!fs.existsSync(accountsFile)) {
      return res.status(404).json({ error: '账号配置文件不存在' });
    }
    
    const data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    const accountIndex = data.accounts.findIndex(acc => acc.id === accountId);
    
    if (accountIndex === -1) {
      return res.status(404).json({ error: '账号不存在' });
    }
    
    const deletedAccount = data.accounts[accountIndex];
    data.accounts.splice(accountIndex, 1);
    
    fs.writeFileSync(accountsFile, JSON.stringify(data, null, 2), 'utf8');
    log(`✅ 账号已删除: ${deletedAccount.email || accountId}`);
    
    // 手动触发热重载
    configWatcher.reload('accounts');
    
    res.json({ 
      success: true, 
      message: `账号 ${deletedAccount.email || accountId} 已删除`,
      remainingCount: data.accounts.length
    });
  } catch (error) {
    log(`❌ 删除账号失败: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 重置账号（刷新 Token 并测试连接）
router.post('/api/accounts/:accountId/reset', async (req, res) => {
  const accountId = req.params.accountId;
  let account;

  log(`🔄 开始重置账号: ${accountId}`);

  try {
    // 1. 刷新 Token
    account = await refreshAccountToken(accountId);
    log(`✅ Token 刷新成功: ${account.email}`);
  } catch (error) {
    log(`❌ Token 刷新失败: ${error.message}`);
    return res.json({ success: false, error: `Token 刷新失败: ${error.message}` });
  }

  try {
    // 2. 发送测试消息验证账号可用性
    log(`🔄 开始连接测试: ${account.email}`);
    const testClient = new KiroClient(account.credentials.accessToken, {
      timeout: 15000
    });

    await testClient.chat('hi', {
      modelId: 'claude-haiku-4.5'
    });

    log(`✅ 账号重置成功: ${account.email}`);
    res.json({ success: true, account, message: '账号重置成功，连接测试通过' });
  } catch (error) {
    // 测试失败，标记账号为错误状态
    log(`❌ 连接测试失败: ${account.email} - ${error.message}`);
    markAccountError(accountId, `连接测试失败: ${error.message}`);
    res.json({ success: false, error: `Token 刷新成功，但连接测试失败: ${error.message}` });
  }
});

module.exports = router;
