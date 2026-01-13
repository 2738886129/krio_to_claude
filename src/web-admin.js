const express = require('express');
const fs = require('fs');
const path = require('path');
const { refreshAccountToken, markAccountError } = require('./loadMultiAccount');
const KiroClient = require('./KiroClient');

const router = express.Router();

// 配置文件路径
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'server-debug.log');

// 日志函数（追加到主日志文件）
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(LOG_FILE, logMessage);
  } catch (e) {
    // 忽略日志写入错误
  }
}

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
        account: { multiAccountEnabled: false, strategy: 'auto', autoSwitchOnError: true }
      });
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
