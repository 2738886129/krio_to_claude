const fs = require('fs');
const path = require('path');

/**
 * 从 kiro-auth-token.json 文件加载 Bearer Token
 * @returns {string} Bearer Token
 */
function loadToken() {
  const tokenPath = path.join(__dirname, 'kiro-auth-token.json');
  
  try {
    const data = fs.readFileSync(tokenPath, 'utf8');
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
      throw new Error(`Token 文件不存在: ${tokenPath}`);
    }
    throw new Error(`读取 Token 失败: ${error.message}`);
  }
}

/**
 * 获取完整的 Token 信息
 * @returns {object} Token 数据
 */
function loadTokenInfo() {
  const tokenPath = path.join(__dirname, 'kiro-auth-token.json');
  
  try {
    const data = fs.readFileSync(tokenPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Token 文件不存在: ${tokenPath}`);
    }
    throw new Error(`读取 Token 失败: ${error.message}`);
  }
}

module.exports = { loadToken, loadTokenInfo };
