const fs = require('fs');
const path = require('path');

const KIRO_AUTH_ENDPOINT = 'https://prod.us-east-1.auth.desktop.kiro.dev';
const TOKEN_PATH = path.join(__dirname, '..', 'config', 'kiro-auth-token.json');

/**
 * 刷新 Token
 * @param {string} refreshToken - 刷新令牌
 * @returns {Promise<object>} 刷新结果
 */
async function refreshSocialToken(refreshToken) {
  const url = `${KIRO_AUTH_ENDPOINT}/refreshToken`;
  
  console.log('🔄 正在刷新 Token...');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'kiro-account-manager/1.0.0'
    },
    body: JSON.stringify({ refreshToken })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`刷新 Token 失败 (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    success: true,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || refreshToken, // 没返回新的就用旧的
    expiresIn: data.expiresIn
  };
}

/**
 * 保存 Token 到文件
 * @param {object} tokenData - Token 数据
 */
function saveTokenToFile(tokenData) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2), 'utf8');
  console.log('✅ Token 已保存到文件');
}

/**
 * 检查 Token 是否需要刷新（过期或即将过期）
 * @param {object} tokenData - Token 数据
 * @param {number} bufferSeconds - 提前刷新的缓冲时间（秒），默认 5 分钟
 * @returns {boolean} 是否需要刷新
 */
function needsRefresh(tokenData, bufferSeconds = 300) {
  if (!tokenData.expiresAt) {
    return false; // 没有过期时间，不刷新
  }
  
  const expiresAt = new Date(tokenData.expiresAt);
  const now = new Date();
  const bufferMs = bufferSeconds * 1000;
  
  return now.getTime() >= (expiresAt.getTime() - bufferMs);
}

/**
 * 从 kiro-auth-token.json 文件加载 Bearer Token
 * @returns {string} Bearer Token
 */
function loadToken() {
  try {
    const data = fs.readFileSync(TOKEN_PATH, 'utf8');
    const tokenData = JSON.parse(data);
    
    if (!tokenData.accessToken) {
      throw new Error('accessToken 字段不存在');
    }
    
    // 检查是否过期
    if (tokenData.expiresAt) {
      const expiresAt = new Date(tokenData.expiresAt);
      const now = new Date();
      
      if (now >= expiresAt) {
        console.warn('⚠️  警告: Token 已过期');
        console.warn(`   过期时间: ${expiresAt.toLocaleString('zh-CN')}`);
        console.warn(`   当前时间: ${now.toLocaleString('zh-CN')}`);
      }
    }
    
    return tokenData.accessToken;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Token 文件不存在: ${TOKEN_PATH}`);
    }
    throw new Error(`读取 Token 失败: ${error.message}`);
  }
}

/**
 * 获取完整的 Token 信息
 * @returns {object} Token 数据
 */
function loadTokenInfo() {
  try {
    const data = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Token 文件不存在: ${TOKEN_PATH}`);
    }
    throw new Error(`读取 Token 失败: ${error.message}`);
  }
}

/**
 * 加载 Token，如果过期或即将过期则自动刷新
 * @param {object} options - 选项
 * @param {number} options.bufferSeconds - 提前刷新的缓冲时间（秒），默认 5 分钟
 * @param {boolean} options.autoSave - 刷新后是否自动保存，默认 true
 * @returns {Promise<string>} Bearer Token
 */
async function loadTokenWithRefresh(options = {}) {
  const { bufferSeconds = 300, autoSave = true } = options;
  
  const tokenData = loadTokenInfo();
  
  if (!tokenData.accessToken) {
    throw new Error('accessToken 字段不存在');
  }
  
  // 检查是否需要刷新
  if (needsRefresh(tokenData, bufferSeconds)) {
    if (!tokenData.refreshToken) {
      console.warn('⚠️  Token 已过期但没有 refreshToken，无法自动刷新');
      return tokenData.accessToken;
    }
    
    try {
      const result = await refreshSocialToken(tokenData.refreshToken);
      
      // 计算新的过期时间
      const expiresAt = new Date(Date.now() + result.expiresIn * 1000);
      
      // 更新 token 数据
      const newTokenData = {
        ...tokenData,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: expiresAt.toISOString()
      };
      
      // 保存到文件
      if (autoSave) {
        saveTokenToFile(newTokenData);
      }
      
      console.log(`✅ Token 刷新成功，新过期时间: ${expiresAt.toLocaleString('zh-CN')}`);
      
      return result.accessToken;
    } catch (error) {
      console.error('❌ Token 刷新失败:', error.message);
      // 刷新失败，返回旧 token（可能已过期）
      return tokenData.accessToken;
    }
  }
  
  return tokenData.accessToken;
}

/**
 * 手动刷新 Token
 * @returns {Promise<object>} 刷新后的完整 Token 数据
 */
async function forceRefreshToken() {
  const tokenData = loadTokenInfo();
  
  if (!tokenData.refreshToken) {
    throw new Error('没有 refreshToken，无法刷新');
  }
  
  const result = await refreshSocialToken(tokenData.refreshToken);
  
  // 计算新的过期时间
  const expiresAt = new Date(Date.now() + result.expiresIn * 1000);
  
  // 更新 token 数据
  const newTokenData = {
    ...tokenData,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: expiresAt.toISOString()
  };
  
  // 保存到文件
  saveTokenToFile(newTokenData);
  
  console.log(`✅ Token 强制刷新成功，新过期时间: ${expiresAt.toLocaleString('zh-CN')}`);
  
  return newTokenData;
}

module.exports = { 
  loadToken, 
  loadTokenInfo, 
  loadTokenWithRefresh,
  forceRefreshToken,
  refreshSocialToken,
  needsRefresh,
  saveTokenToFile
};
