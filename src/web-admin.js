const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 配置文件路径
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const LOGS_DIR = path.join(__dirname, '..', 'logs');

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

module.exports = router;
