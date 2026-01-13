const fs = require('fs');
const path = require('path');
const { refreshSocialToken } = require('./loadToken');
const { log, logWarn, logError } = require('./logger');

const ACCOUNTS_PATH = path.join(__dirname, '..', 'config', 'kiro-accounts.json');

/**
 * 加载多账号配置文件
 * @returns {object} 账号配置数据
 */
function loadAccountsConfig() {
  try {
    const data = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`多账号配置文件不存在: ${ACCOUNTS_PATH}`);
    }
    throw new Error(`读取多账号配置失败: ${error.message}`);
  }
}

/**
 * 保存账号配置到文件
 * @param {object} config - 账号配置数据
 */
function saveAccountsConfig(config) {
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * 获取所有可用账号（状态为 active）
 * @returns {Array} 可用账号列表
 */
function getAvailableAccounts() {
  const config = loadAccountsConfig();
  return config.accounts.filter(acc => acc.status === 'active');
}

/**
 * 获取所有账号（包括不可用的）
 * @returns {Array} 所有账号列表
 */
function getAllAccounts() {
  const config = loadAccountsConfig();
  return config.accounts;
}

/**
 * 根据 ID 查找账号
 * @param {string} accountId - 账号 ID
 * @returns {object|null} 账号对象
 */
function findAccountById(accountId) {
  const config = loadAccountsConfig();
  return config.accounts.find(acc => acc.id === accountId) || null;
}

/**
 * 根据邮箱查找账号
 * @param {string} email - 邮箱地址
 * @returns {object|null} 账号对象
 */
function findAccountByEmail(email) {
  const config = loadAccountsConfig();
  return config.accounts.find(acc => acc.email === email) || null;
}

/**
 * 检查账号 Token 是否需要刷新
 * @param {object} account - 账号对象
 * @param {number} bufferSeconds - 提前刷新的缓冲时间（秒）
 * @returns {boolean} 是否需要刷新
 */
function accountNeedsRefresh(account, bufferSeconds = 300) {
  if (!account.credentials || !account.credentials.expiresAt) {
    return false;
  }
  
  const expiresAt = new Date(account.credentials.expiresAt);
  const now = new Date();
  const bufferMs = bufferSeconds * 1000;
  
  return now.getTime() >= (expiresAt.getTime() - bufferMs);
}

/**
 * 刷新指定账号的 Token
 * @param {string} accountId - 账号 ID
 * @returns {Promise<object>} 刷新后的账号对象
 */
async function refreshAccountToken(accountId) {
  const config = loadAccountsConfig();
  const accountIndex = config.accounts.findIndex(acc => acc.id === accountId);
  
  if (accountIndex === -1) {
    throw new Error(`账号不存在: ${accountId}`);
  }
  
  const account = config.accounts[accountIndex];
  
  if (!account.credentials || !account.credentials.refreshToken) {
    throw new Error(`账号 ${account.email} 没有 refreshToken，无法刷新`);
  }
  
  log(`🔄 正在刷新账号 ${account.email} 的 Token...`);
  
  try {
    const result = await refreshSocialToken(account.credentials.refreshToken);
    
    // 计算新的过期时间
    const expiresAt = Date.now() + result.expiresIn * 1000;
    
    // 更新账号信息
    config.accounts[accountIndex].credentials.accessToken = result.accessToken;
    config.accounts[accountIndex].credentials.refreshToken = result.refreshToken;
    config.accounts[accountIndex].credentials.expiresAt = expiresAt;
    config.accounts[accountIndex].status = 'active';
    config.accounts[accountIndex].lastError = undefined;
    
    // 保存到文件
    saveAccountsConfig(config);
    
    log(`✅ 账号 ${account.email} Token 刷新成功`);
    
    return config.accounts[accountIndex];
  } catch (error) {
    // 刷新失败，更新错误状态
    config.accounts[accountIndex].status = 'error';
    config.accounts[accountIndex].lastError = error.message;
    config.accounts[accountIndex].lastCheckedAt = Date.now();
    saveAccountsConfig(config);
    
    throw error;
  }
}

/**
 * 选择最佳账号（根据策略）
 * @param {string} strategy - 选择策略: 'auto'(自动选择使用量最低), 'random'(随机), 'first'(第一个可用)
 * @returns {object|null} 选中的账号对象
 */
function selectBestAccount(strategy = 'auto') {
  const availableAccounts = getAvailableAccounts();
  
  if (availableAccounts.length === 0) {
    return null;
  }
  
  switch (strategy) {
    case 'auto':
      // 选择使用量百分比最低的账号
      return availableAccounts.reduce((best, current) => {
        const bestPercent = best.usage?.percentUsed || 0;
        const currentPercent = current.usage?.percentUsed || 0;
        return currentPercent < bestPercent ? current : best;
      });
      
    case 'random':
      // 随机选择
      return availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
      
    case 'first':
      // 选择第一个
      return availableAccounts[0];
      
    default:
      return availableAccounts[0];
  }
}

/**
 * 获取账号的 accessToken（如果需要会自动刷新）
 * @param {string} accountId - 账号 ID
 * @param {object} options - 选项
 * @param {number} options.bufferSeconds - 提前刷新的缓冲时间（秒）
 * @returns {Promise<string>} accessToken
 */
async function getAccountToken(accountId, options = {}) {
  const { bufferSeconds = 300 } = options;
  
  let account = findAccountById(accountId);
  
  if (!account) {
    throw new Error(`账号不存在: ${accountId}`);
  }
  
  // 检查是否需要刷新
  if (accountNeedsRefresh(account, bufferSeconds)) {
    account = await refreshAccountToken(accountId);
  }
  
  if (!account.credentials || !account.credentials.accessToken) {
    throw new Error(`账号 ${account.email} 没有 accessToken`);
  }
  
  return account.credentials.accessToken;
}

/**
 * 获取最佳账号的 Token（自动选择并刷新）
 * @param {object} options - 选项
 * @param {string} options.strategy - 选择策略
 * @param {number} options.bufferSeconds - 提前刷新的缓冲时间（秒）
 * @returns {Promise<{token: string, account: object}>} Token 和账号信息
 */
async function getBestAccountToken(options = {}) {
  const { strategy = 'auto', bufferSeconds = 300 } = options;
  
  const account = selectBestAccount(strategy);
  
  if (!account) {
    throw new Error('没有可用的账号');
  }
  
  log(`📌 选择账号: ${account.email} (使用率: ${(account.usage?.percentUsed * 100 || 0).toFixed(1)}%)`);
  
  const token = await getAccountToken(account.id, { bufferSeconds });
  
  return { token, account };
}

/**
 * 更新账号的使用情况
 * @param {string} accountId - 账号 ID
 * @param {object} usage - 使用情况数据
 */
function updateAccountUsage(accountId, usage) {
  const config = loadAccountsConfig();
  const accountIndex = config.accounts.findIndex(acc => acc.id === accountId);
  
  if (accountIndex === -1) {
    return;
  }
  
  config.accounts[accountIndex].usage = {
    ...config.accounts[accountIndex].usage,
    ...usage,
    lastUpdated: Date.now()
  };
  
  saveAccountsConfig(config);
}

/**
 * 标记账号为错误状态
 * @param {string} accountId - 账号 ID
 * @param {string} errorMessage - 错误消息
 */
function markAccountError(accountId, errorMessage) {
  const config = loadAccountsConfig();
  const accountIndex = config.accounts.findIndex(acc => acc.id === accountId);
  
  if (accountIndex === -1) {
    return;
  }
  
  config.accounts[accountIndex].status = 'error';
  config.accounts[accountIndex].lastError = errorMessage;
  config.accounts[accountIndex].lastCheckedAt = Date.now();
  
  saveAccountsConfig(config);
  
  logWarn(`账号 ${config.accounts[accountIndex].email} 标记为错误: ${errorMessage}`);
}

/**
 * 检查错误是否为额度不足或账号问题
 * @param {Error} error - 错误对象
 * @returns {boolean} 是否应该切换账号
 */
function shouldSwitchAccount(error) {
  const errorMessage = error.message || '';
  
  // 额度不足相关错误
  const quotaErrors = [
    'quota',
    'limit',
    'exceeded',
    'insufficient',
    'credit',
    'usage',
    'overloaded'
  ];
  
  // 账号问题相关错误
  const accountErrors = [
    'suspended',
    'banned',
    'disabled',
    'unauthorized',
    'authentication',
    'invalid token',
    'token expired'
  ];
  
  const lowerMessage = errorMessage.toLowerCase();
  
  // 检查是否包含相关关键词
  const hasQuotaError = quotaErrors.some(keyword => lowerMessage.includes(keyword));
  const hasAccountError = accountErrors.some(keyword => lowerMessage.includes(keyword));
  
  return hasQuotaError || hasAccountError;
}

/**
 * 切换到下一个可用账号
 * @param {string} currentAccountId - 当前账号 ID
 * @param {string} strategy - 选择策略
 * @returns {Promise<{token: string, account: object}|null>} 新账号信息或 null
 */
async function switchToNextAccount(currentAccountId, strategy = 'auto') {
  log('🔄 尝试切换账号...');

  // 先标记当前账号为错误状态
  markAccountError(currentAccountId, '额度不足或账号异常，已自动切换');

  // 获取其他可用账号
  const availableAccounts = getAvailableAccounts();

  if (availableAccounts.length === 0) {
    logError('没有其他可用账号');
    return null;
  }

  // 选择新账号
  const newAccount = selectBestAccount(strategy);

  if (!newAccount) {
    logError('无法选择新账号');
    return null;
  }

  log(`✅ 切换到新账号: ${newAccount.email} (使用率: ${(newAccount.usage?.percentUsed * 100 || 0).toFixed(1)}%)`);

  // 获取新账号的 Token
  try {
    const token = await getAccountToken(newAccount.id);
    return { token, account: newAccount };
  } catch (error) {
    logError(`获取新账号 Token 失败: ${error.message}`);
    return null;
  }
}

module.exports = {
  loadAccountsConfig,
  saveAccountsConfig,
  getAvailableAccounts,
  getAllAccounts,
  findAccountById,
  findAccountByEmail,
  accountNeedsRefresh,
  refreshAccountToken,
  selectBestAccount,
  getAccountToken,
  getBestAccountToken,
  updateAccountUsage,
  markAccountError,
  shouldSwitchAccount,
  switchToNextAccount
};
