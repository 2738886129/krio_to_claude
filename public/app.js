// 切换标签页
function switchTab(tabName) {
  // 更新标签按钮状态
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');

  // 更新内容显示
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(tabName).classList.add('active');

  // 加载对应内容
  if (tabName === 'accounts') {
    loadAccounts();
  } else if (tabName === 'config') {
    loadConfig();
  } else if (tabName === 'models') {
    loadModels();
  } else if (tabName === 'logs') {
    loadLog();
  }
}

// 检查服务器状态
async function checkServerStatus() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    
    document.getElementById('serverStatus').innerHTML = '<span class="status-online">● 在线</span>';
    
    return true;
  } catch (error) {
    document.getElementById('serverStatus').innerHTML = '<span class="status-error">● 离线</span>';
    return false;
  }
}

// 加载账号列表
async function loadAccounts() {
  const container = document.getElementById('accountsList');
  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const response = await fetch('/api/accounts');
    const data = await response.json();

    if (!data.accounts || data.accounts.length === 0) {
      container.innerHTML = '<p style="color: #6b7280;">暂无账号数据</p>';
      return;
    }

    // 更新统计信息（只统计活跃账号）
    const activeAccountsList = data.accounts.filter(acc => acc.status === 'active');
    const activeAccounts = activeAccountsList.length;
    const totalLimit = activeAccountsList.reduce((sum, acc) => sum + (acc.usage?.limit || 0), 0);
    const totalUsed = activeAccountsList.reduce((sum, acc) => sum + (acc.usage?.current || 0), 0);

    document.getElementById('activeAccounts').textContent = activeAccounts;
    document.getElementById('totalQuota').textContent = totalLimit.toFixed(2);
    document.getElementById('usedQuota').textContent = totalUsed.toFixed(2);

    // 渲染账号卡片
    let html = '';
    data.accounts.forEach(account => {
      const percentUsed = (account.usage?.percentUsed || 0) * 100;
      const progressClass = percentUsed > 80 ? 'danger' : percentUsed > 50 ? 'warning' : '';
      
      html += `
        <div class="account-card ${account.status === 'error' ? 'error' : ''}">
          <div class="account-header">
            <div class="account-email">${account.email}</div>
            <span class="badge ${account.status === 'active' ? 'badge-active' : 'badge-error'}">
              ${account.status === 'active' ? '活跃' : '错误'}
            </span>
          </div>
          
          <div class="account-info">
            <div class="info-item">
              <div class="info-label">用户ID</div>
              <div class="info-value">${account.userId || '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">昵称</div>
              <div class="info-value">${account.nickname || '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">认证提供商</div>
              <div class="info-value">${account.idp || '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">订阅类型</div>
              <div class="info-value">${account.subscription?.title || '-'}</div>
            </div>
          </div>

          <div style="margin-top: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 14px; color: #6b7280;">额度使用</span>
              <span style="font-size: 14px; font-weight: 600; color: #374151;">
                ${(account.usage?.current || 0).toFixed(2)} / ${account.usage?.limit || 0}
                (${percentUsed.toFixed(1)}%)
              </span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${progressClass}" style="width: ${percentUsed}%"></div>
            </div>
          </div>

          ${account.lastError ? `
            <div style="margin-top: 15px; padding: 10px; background: #fee2e2; border-radius: 6px;">
              <div style="font-size: 12px; color: #991b1b; font-weight: 600; margin-bottom: 4px;">最后错误</div>
              <div style="font-size: 12px; color: #991b1b;">${account.lastError}</div>
            </div>
          ` : ''}

          <div style="margin-top: 15px; display: flex; gap: 10px; font-size: 12px; color: #6b7280;">
            <div>最后使用: ${account.lastUsedAt ? new Date(account.lastUsedAt).toLocaleString('zh-CN') : '-'}</div>
            ${account.lastCheckedAt ? `<div>最后检查: ${new Date(account.lastCheckedAt).toLocaleString('zh-CN')}</div>` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载失败: ${error.message}</div>`;
  }
}

// 加载服务器配置
async function loadConfig() {
  const container = document.getElementById('configContent');
  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    let html = '<h3 style="margin-bottom: 20px; color: #374151;">当前配置</h3>';

    // 服务器配置
    html += '<div class="config-item">';
    html += '<label>服务器地址</label>';
    html += `<div class="value">${config.server?.host || '0.0.0.0'}:${config.server?.port || 3000}</div>`;
    html += '</div>';

    // 账号模式
    html += '<div class="config-item">';
    html += '<label>账号模式</label>';
    html += `<div class="value">${config.account?.multiAccountEnabled ? '多账号模式' : '单账号模式'}</div>`;
    html += '</div>';

    if (config.account?.multiAccountEnabled) {
      html += '<div class="config-item">';
      html += '<label>账号选择策略</label>';
      html += `<div class="value">${config.account?.strategy || 'auto'}</div>`;
      html += '</div>';

      html += '<div class="config-item">';
      html += '<label>自动切换账号</label>';
      html += `<div class="value">${config.account?.autoSwitchOnError ? '启用' : '禁用'}</div>`;
      html += '</div>';
    }

    // 流式配置
    html += '<div class="config-item">';
    html += '<label>流式响应块大小</label>';
    html += `<div class="value">${config.stream?.chunkSize || 4} 字符</div>`;
    html += '</div>';

    // Token 刷新配置
    html += '<div class="config-item">';
    html += '<label>Token 刷新配置</label>';
    html += `<div class="value">最大重试: ${config.token?.refreshRetryMax || 3}次<br>`;
    html += `重试间隔: ${(config.token?.refreshRetryIntervalMs || 60000) / 1000}秒<br>`;
    html += `提前刷新: ${config.token?.refreshBufferMinutes || 5}分钟</div>`;
    html += '</div>';

    // 连接池配置
    html += '<div class="config-item">';
    html += '<label>连接池配置</label>';
    html += `<div class="value">最大连接数: ${config.connectionPool?.maxSockets || 20}<br>`;
    html += `空闲连接数: ${config.connectionPool?.maxFreeSockets || 10}<br>`;
    html += `连接超时: ${(config.connectionPool?.socketTimeout || 60000) / 1000}秒<br>`;
    html += `请求超时: ${(config.connectionPool?.requestTimeout || 30000) / 1000}秒</div>`;
    html += '</div>';

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载失败: ${error.message}</div>`;
  }
}

// 加载模型映射
async function loadModels() {
  const container = document.getElementById('modelsContent');
  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const response = await fetch('/api/models');
    const data = await response.json();

    let html = '<h3 style="margin-bottom: 20px; color: #374151;">模型映射表</h3>';
    
    html += '<div class="config-item">';
    html += '<label>默认模型</label>';
    html += `<div class="value">${data.defaultModel || 'claude-sonnet-4.5'}</div>`;
    html += '</div>';

    html += '<table>';
    html += '<thead><tr><th>Claude 模型 ID</th><th>Kiro 模型 ID</th></tr></thead>';
    html += '<tbody>';

    for (const [claudeModel, kiroModel] of Object.entries(data.mappings || {})) {
      html += `<tr><td>${claudeModel}</td><td>${kiroModel}</td></tr>`;
    }

    html += '</tbody></table>';

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载失败: ${error.message}</div>`;
  }
}

// 加载日志
async function loadLog() {
  const logSelect = document.getElementById('logSelect');
  const logContent = document.getElementById('logContent');
  const logFile = logSelect.value;

  logContent.textContent = '加载中...';

  try {
    const response = await fetch(`/api/logs/${logFile}`);
    const text = await response.text();

    if (text.trim()) {
      logContent.textContent = text;
      // 自动滚动到底部
      logContent.scrollTop = logContent.scrollHeight;
    } else {
      logContent.textContent = '日志文件为空';
    }
  } catch (error) {
    logContent.textContent = `加载失败: ${error.message}`;
  }
}

// 初始化
async function init() {
  await checkServerStatus();
  loadAccounts();
  
  // 每30秒刷新一次状态
  setInterval(() => {
    checkServerStatus();
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'accounts') {
      loadAccounts();
    }
  }, 30000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
