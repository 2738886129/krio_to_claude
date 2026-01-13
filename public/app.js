// ============================================
// 全局状态管理
// ============================================
const AppState = {
  accounts: [],
  filteredAccounts: [],
  viewMode: 'grid', // 'grid' or 'list'
  searchQuery: '',
  statusFilter: 'all', // 'all', 'active', 'error'
  sortBy: 'email', // 'email', 'quota', 'usage'
  lastDataHash: null
};

// ============================================
// 工具函数
// ============================================
function getInitials(email) {
  if (!email) return '?';
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatShortDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function hashData(data) {
  return JSON.stringify(data);
}

// 显示通知
function showNotification(message, type = 'info') {
  // 移除已存在的通知
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  // 3秒后自动消失
  setTimeout(() => notification.remove(), 3000);
}

// 重置账号（尝试刷新 Token）
async function resetAccount(accountId, event) {
  if (event) event.stopPropagation();

  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '重置中...';
  }

  try {
    const response = await fetch(`/api/accounts/${accountId}/reset`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      showNotification('账号重置成功', 'success');
    } else {
      showNotification(`重置失败: ${result.error}`, 'error');
    }

    // 刷新账号列表
    loadAccounts(true);
  } catch (error) {
    showNotification(`重置失败: ${error.message}`, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '重置';
    }
  }
}

// ============================================
// 切换标签页
// ============================================
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(tabName).classList.add('active');

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

// ============================================
// 检查服务器状态
// ============================================
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

// ============================================
// 账号管理核心功能
// ============================================

// 切换视图模式
function setViewMode(mode) {
  AppState.viewMode = mode;
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  renderAccounts();
}

// 搜索账号
function searchAccounts(query) {
  AppState.searchQuery = query.toLowerCase();
  updateSearchBoxState();
  filterAndRenderAccounts();
}

// 更新搜索框状态
function updateSearchBoxState() {
  const searchBox = document.querySelector('.search-box');
  if (searchBox) {
    if (AppState.searchQuery) {
      searchBox.classList.add('has-value');
    } else {
      searchBox.classList.remove('has-value');
    }
  }
}

// 清空搜索
function clearSearch() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = '';
  }
  AppState.searchQuery = '';
  updateSearchBoxState();
  filterAndRenderAccounts();
}

// 筛选状态
function filterByStatus(status) {
  AppState.statusFilter = status;
  filterAndRenderAccounts();
}

// 排序账号
function sortAccounts(sortBy) {
  AppState.sortBy = sortBy;
  filterAndRenderAccounts();
}

// 筛选和渲染
function filterAndRenderAccounts() {
  let filtered = [...AppState.accounts];

  // 搜索过滤
  if (AppState.searchQuery) {
    filtered = filtered.filter(acc =>
      (acc.email && acc.email.toLowerCase().includes(AppState.searchQuery)) ||
      (acc.nickname && acc.nickname.toLowerCase().includes(AppState.searchQuery)) ||
      (acc.userId && acc.userId.toLowerCase().includes(AppState.searchQuery))
    );
  }

  // 状态过滤
  if (AppState.statusFilter !== 'all') {
    filtered = filtered.filter(acc => acc.status === AppState.statusFilter);
  }

  // 排序
  filtered.sort((a, b) => {
    switch (AppState.sortBy) {
      case 'email':
        return (a.email || '').localeCompare(b.email || '');
      case 'quota':
        return (b.usage?.limit || 0) - (a.usage?.limit || 0);
      case 'usage':
        return (b.usage?.percentUsed || 0) - (a.usage?.percentUsed || 0);
      default:
        return 0;
    }
  });

  AppState.filteredAccounts = filtered;
  renderAccounts();
}

// 切换账号详情
function toggleDetails(accountId) {
  const details = document.getElementById(accountId);
  const toggle = document.getElementById(`${accountId}-toggle`);

  if (details.classList.contains('show')) {
    details.classList.remove('show');
    toggle.classList.remove('expanded');
  } else {
    details.classList.add('show');
    toggle.classList.add('expanded');
  }
}

// 加载账号列表
async function loadAccounts(forceRefresh = false) {
  const container = document.getElementById('accountsContainer');
  if (!container) return;

  if (AppState.accounts.length === 0) {
    container.innerHTML = '<div class="loading">加载中...</div>';
  }

  try {
    const response = await fetch('/api/accounts');
    const data = await response.json();

    if (!data.accounts || data.accounts.length === 0) {
      container.innerHTML = `
        <div class="accounts-empty">
          <div class="icon">📭</div>
          <div class="title">暂无账号数据</div>
          <div class="desc">请先添加 Kiro 账号配置</div>
        </div>
      `;
      AppState.accounts = [];
      AppState.filteredAccounts = [];
      updateStats({ accounts: [] });
      return;
    }

    const dataHash = hashData(data);
    if (!forceRefresh && AppState.lastDataHash === dataHash) {
      return;
    }

    AppState.lastDataHash = dataHash;
    AppState.accounts = data.accounts;

    updateStats(data);
    filterAndRenderAccounts();
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载失败: ${error.message}</div>`;
  }
}

// 更新统计信息
function updateStats(data) {
  const activeAccountsList = data.accounts.filter(acc => acc.status === 'active');
  const errorAccountsList = data.accounts.filter(acc => acc.status === 'error');
  const activeAccounts = activeAccountsList.length;
  const totalLimit = activeAccountsList.reduce((sum, acc) => sum + (acc.usage?.limit || 0), 0);
  const totalUsed = activeAccountsList.reduce((sum, acc) => sum + (acc.usage?.current || 0), 0);

  document.getElementById('activeAccounts').textContent = activeAccounts;
  document.getElementById('totalQuota').textContent = totalLimit.toFixed(2);
  document.getElementById('usedQuota').textContent = totalUsed.toFixed(2);

  // 更新内部统计概览
  const overviewContainer = document.getElementById('accountsOverview');
  if (overviewContainer) {
    const percentUsed = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;
    const remaining = totalLimit - totalUsed;

    overviewContainer.innerHTML = `
      <div class="accounts-overview">
        <div class="overview-item">
          <div class="icon">👥</div>
          <div class="number">${data.accounts.length}</div>
          <div class="label">总账号数</div>
        </div>
        <div class="overview-item">
          <div class="icon">✅</div>
          <div class="number" style="color: #10b981;">${activeAccounts}</div>
          <div class="label">活跃账号</div>
        </div>
        <div class="overview-item">
          <div class="icon">⚠️</div>
          <div class="number" style="color: ${errorAccountsList.length > 0 ? '#ef4444' : '#6b7280'};">${errorAccountsList.length}</div>
          <div class="label">异常账号</div>
        </div>
        <div class="overview-item">
          <div class="icon">📊</div>
          <div class="number">${remaining.toFixed(1)}</div>
          <div class="label">剩余额度</div>
        </div>
      </div>
      <div class="quota-overview">
        <div class="quota-header">
          <span class="quota-title">总额度使用情况</span>
          <span class="quota-numbers">
            <strong>${totalUsed.toFixed(2)}</strong> / ${totalLimit.toFixed(2)} (${percentUsed.toFixed(1)}%)
          </span>
        </div>
        <div class="quota-bar">
          <div class="quota-fill ${percentUsed > 80 ? 'danger' : percentUsed > 50 ? 'warning' : ''}"
               style="width: ${percentUsed}%"></div>
        </div>
      </div>
    `;
  }
}

// 生成唯一账号ID
function getAccountUniqueId(account) {
  // 使用 email 或 userId 生成唯一标识
  const base = account.email || account.userId || Math.random().toString(36);
  return 'acc-' + base.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
}

// 渲染账号列表
function renderAccounts() {
  const container = document.getElementById('accountsContainer');
  if (!container) return;

  if (AppState.filteredAccounts.length === 0) {
    container.innerHTML = `
      <div class="accounts-empty">
        <div class="icon">🔍</div>
        <div class="title">没有匹配的账号</div>
        <div class="desc">尝试调整搜索条件或筛选器</div>
      </div>
    `;
    return;
  }

  const isListView = AppState.viewMode === 'list';
  let html = `<div class="${isListView ? 'accounts-list' : 'accounts-grid'}">`;

  AppState.filteredAccounts.forEach((account, index) => {
    const percentUsed = (account.usage?.percentUsed || 0) * 100;
    const progressClass = percentUsed > 80 ? 'danger' : percentUsed > 50 ? 'warning' : '';
    const accountId = getAccountUniqueId(account);
    const initials = getInitials(account.email);

    html += `
      <div class="account-card ${account.status === 'error' ? 'error' : ''} ${isListView ? 'list-view' : ''}">
        <div class="account-status-indicator"></div>
        <div class="account-card-main">
          <div class="account-header">
            <div class="account-identity">
              <div class="account-avatar">${initials}</div>
              <div class="account-name-group">
                <div class="account-email">${account.email || '未知邮箱'}</div>
                <div class="account-meta">
                  <span class="account-nickname">${account.nickname || account.userId?.split('.')[1]?.substring(0, 12) || '-'}</span>
                  ${account.status === 'error' ? `<button class="btn-reset-small" onclick="resetAccount('${account.id}', event)">重置</button>` : ''}
                </div>
              </div>
            </div>
            <div class="account-badges">
              <span class="badge ${account.status === 'active' ? 'badge-active' : 'badge-error'}">
                ${account.status === 'active' ? '✓ 活跃' : '✗ 错误'}
              </span>
              ${account.subscription?.title ? `<span class="badge badge-subscription">${account.subscription.title}</span>` : ''}
            </div>
          </div>

          <div class="account-quota">
            <div class="quota-info">
              <span class="quota-label">额度使用</span>
              <span class="quota-value">${(account.usage?.current || 0).toFixed(2)} / ${account.usage?.limit || 0} (${percentUsed.toFixed(1)}%)</span>
            </div>
            <div class="account-progress">
              <div class="account-progress-fill ${progressClass}" style="width: ${Math.min(percentUsed, 100)}%"></div>
            </div>
          </div>
        </div>

        <div id="${accountId}" class="account-details">
          <div class="account-details-inner">
            ${account.lastError ? `
              <div class="account-error-box">
                <div class="account-error-title">最后错误信息</div>
                <div class="account-error-message">${account.lastError}</div>
              </div>
            ` : ''}

            <div class="account-info-grid">
              <div class="info-item">
                <div class="info-label">用户 ID</div>
                <div class="info-value" style="font-size: 12px; word-break: break-all;">${account.userId || '-'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">认证提供商</div>
                <div class="info-value">${account.idp || '-'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">订阅到期</div>
                <div class="info-value">${formatShortDate(account.subscription?.expiresAt)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">剩余天数</div>
                <div class="info-value">${account.subscription?.daysRemaining || '-'} 天</div>
              </div>
            </div>

            <div class="account-timestamps">
              <div class="timestamp-item">
                <strong>最后使用:</strong> ${formatDate(account.lastUsedAt)}
              </div>
              ${account.lastCheckedAt ? `
                <div class="timestamp-item">
                  <strong>最后检查:</strong> ${formatDate(account.lastCheckedAt)}
                </div>
              ` : ''}
              ${account.createdAt ? `
                <div class="timestamp-item">
                  <strong>创建时间:</strong> ${formatDate(account.createdAt)}
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <div id="${accountId}-toggle" class="account-toggle" onclick="toggleDetails('${accountId}')">
          <span>查看详情</span>
          <span class="arrow">▼</span>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// 初始化账号管理区域的 HTML 结构
function initAccountsSection() {
  const accountsSection = document.getElementById('accounts');
  accountsSection.innerHTML = `
    <h2>账号管理</h2>

    <!-- 工具栏 -->
    <div class="accounts-toolbar">
      <div class="search-box">
        <input type="text" placeholder="搜索邮箱、昵称或用户ID..."
               oninput="searchAccounts(this.value)" id="searchInput">
        <button class="search-clear" onclick="clearSearch()" title="清空搜索">✕</button>
      </div>
      <div class="filter-group">
        <select class="filter-select" onchange="filterByStatus(this.value)">
          <option value="all">全部状态</option>
          <option value="active">仅活跃</option>
          <option value="error">仅异常</option>
        </select>
        <select class="filter-select" onchange="sortAccounts(this.value)">
          <option value="email">按邮箱排序</option>
          <option value="quota">按额度排序</option>
          <option value="usage">按使用率排序</option>
        </select>
        <div class="view-toggle">
          <button class="view-btn active" data-mode="grid" onclick="setViewMode('grid')" title="网格视图">⊞</button>
          <button class="view-btn" data-mode="list" onclick="setViewMode('list')" title="列表视图">☰</button>
        </div>
      </div>
    </div>

    <!-- 统计概览 -->
    <div id="accountsOverview"></div>

    <!-- 账号列表容器 -->
    <div id="accountsContainer">
      <div class="loading">加载中...</div>
    </div>
  `;
}

// ============================================
// 加载服务器配置
// ============================================
async function loadConfig() {
  const container = document.getElementById('configContent');
  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    let html = '<h3 style="margin-bottom: 20px; color: #374151;">当前配置</h3>';

    html += '<div class="config-item">';
    html += '<label>服务器地址</label>';
    html += `<div class="value">${config.server?.host || '0.0.0.0'}:${config.server?.port || 3000}</div>`;
    html += '</div>';

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

    html += '<div class="config-item">';
    html += '<label>流式响应块大小</label>';
    html += `<div class="value">${config.stream?.chunkSize || 4} 字符</div>`;
    html += '</div>';

    html += '<div class="config-item">';
    html += '<label>Token 刷新配置</label>';
    html += `<div class="value">最大重试: ${config.token?.refreshRetryMax || 3}次<br>`;
    html += `重试间隔: ${(config.token?.refreshRetryIntervalMs || 60000) / 1000}秒<br>`;
    html += `提前刷新: ${config.token?.refreshBufferMinutes || 5}分钟</div>`;
    html += '</div>';

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

// ============================================
// 加载模型映射
// ============================================
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

// ============================================
// 加载日志
// ============================================
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
      logContent.scrollTop = logContent.scrollHeight;
    } else {
      logContent.textContent = '日志文件为空';
    }
  } catch (error) {
    logContent.textContent = `加载失败: ${error.message}`;
  }
}

// ============================================
// 初始化
// ============================================
async function init() {
  // 初始化账号管理区域
  initAccountsSection();

  await checkServerStatus();
  loadAccounts();

  // 每30秒刷新一次
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
