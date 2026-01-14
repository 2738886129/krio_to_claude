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

// 测试账号可用性
async function testAccount(accountId, event) {
  if (event) event.stopPropagation();

  const btn = event?.target;
  const originalText = btn?.textContent || '测试';
  
  if (btn) {
    btn.disabled = true;
    btn.textContent = '测试中...';
    btn.classList.add('testing');
  }

  try {
    const response = await fetch(`/api/accounts/${accountId}/test`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      showNotification(`账号可用，响应时间: ${result.responseTime}ms`, 'success');
      if (btn) {
        btn.textContent = '✓ 可用';
        btn.classList.remove('testing');
        btn.classList.add('test-success');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('test-success');
          btn.disabled = false;
        }, 2000);
      }
    } else {
      showNotification(`测试失败: ${result.error}`, 'error');
      if (btn) {
        btn.textContent = '✗ 失败';
        btn.classList.remove('testing');
        btn.classList.add('test-failed');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('test-failed');
          btn.disabled = false;
        }, 2000);
      }
      // 刷新账号列表以显示错误状态
      loadAccounts(true);
    }
  } catch (error) {
    showNotification(`测试失败: ${error.message}`, 'error');
    if (btn) {
      btn.textContent = '✗ 失败';
      btn.classList.remove('testing');
      btn.classList.add('test-failed');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('test-failed');
        btn.disabled = false;
      }, 2000);
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
  // 根据模式选择不同的容器
  const isMultiAccount = AppState.isMultiAccountMode;
  
  if (isMultiAccount) {
    await loadMultiAccounts(forceRefresh);
  } else {
    await loadSingleAccount(forceRefresh);
  }
}

// 加载多账号列表
async function loadMultiAccounts(forceRefresh = false) {
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

// 加载单账号信息
async function loadSingleAccount(forceRefresh = false) {
  const container = document.getElementById('singleAccountContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const response = await fetch('/api/accounts');
    const data = await response.json();

    if (!data.accounts || data.accounts.length === 0) {
      container.innerHTML = `
        <div class="single-account-empty">
          <div class="icon">📭</div>
          <div class="title">未配置账号</div>
          <div class="desc">请在「服务器配置」中上传 kiro-auth-token.json 文件</div>
        </div>
      `;
      updateSingleAccountStats(null);
      return;
    }

    const account = data.accounts[0];
    updateSingleAccountStats(account);
    renderSingleAccount(account);
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载失败: ${error.message}</div>`;
  }
}

// 更新单账号统计信息
function updateSingleAccountStats(account) {
  if (account && account.status === 'active') {
    document.getElementById('activeAccounts').textContent = '1';
    document.getElementById('totalQuota').textContent = (account.usage?.limit || 0).toFixed(2);
    document.getElementById('usedQuota').textContent = (account.usage?.current || 0).toFixed(2);
  } else {
    document.getElementById('activeAccounts').textContent = account ? '0' : '-';
    document.getElementById('totalQuota').textContent = '-';
    document.getElementById('usedQuota').textContent = '-';
  }
}

// 渲染单账号信息
function renderSingleAccount(account) {
  const container = document.getElementById('singleAccountContainer');
  if (!container) return;

  const percentUsed = (account.usage?.percentUsed || 0) * 100;
  const progressClass = percentUsed > 80 ? 'danger' : percentUsed > 50 ? 'warning' : '';
  const initials = getInitials(account.email);

  container.innerHTML = `
    <div class="single-account-card ${account.status === 'error' ? 'error' : ''}">
      <div class="single-account-header">
        <div class="single-account-avatar">${initials}</div>
        <div class="single-account-info">
          <div class="single-account-email">${account.email || '未知邮箱'}</div>
          <div class="single-account-meta">
            <span class="badge ${account.status === 'active' ? 'badge-active' : 'badge-error'}">
              ${account.status === 'active' ? '✓ 活跃' : '✗ 错误'}
            </span>
            ${account.subscription?.title ? `<span class="badge badge-subscription">${account.subscription.title}</span>` : ''}
          </div>
        </div>
        <div class="single-account-actions">
          <button class="btn-test" onclick="testAccount('${account.id}', event)">🧪 测试可用性</button>
          ${account.status === 'error' ? `<button class="btn btn-small" onclick="resetAccount('${account.id}', event)">重置账号</button>` : ''}
        </div>
      </div>

      ${account.lastError ? `
        <div class="single-account-error">
          <strong>错误信息:</strong> ${account.lastError}
        </div>
      ` : ''}

      <div class="single-account-quota">
        <div class="quota-header">
          <span>额度使用情况</span>
          <span class="quota-value">${(account.usage?.current || 0).toFixed(2)} / ${account.usage?.limit || 0} (${percentUsed.toFixed(1)}%)</span>
        </div>
        <div class="quota-bar">
          <div class="quota-fill ${progressClass}" style="width: ${Math.min(percentUsed, 100)}%"></div>
        </div>
      </div>

      <div class="single-account-details">
        <div class="detail-row">
          <span class="detail-label">用户 ID</span>
          <span class="detail-value">${account.userId || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">认证提供商</span>
          <span class="detail-value">${account.idp || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">订阅到期</span>
          <span class="detail-value">${formatShortDate(account.subscription?.expiresAt)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">剩余天数</span>
          <span class="detail-value">${account.subscription?.daysRemaining || '-'} 天</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">最后使用</span>
          <span class="detail-value">${formatDate(account.lastUsedAt)}</span>
        </div>
      </div>
    </div>
  `;
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

          <div class="account-actions">
            <button class="btn-test-small" onclick="testAccount('${account.id}', event)" title="测试账号可用性">🧪 测试</button>
            ${account.status === 'error' ? `<button class="btn-reset-small" onclick="resetAccount('${account.id}', event)">重置</button>` : ''}
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
async function initAccountsSection() {
  const accountsSection = document.getElementById('accounts');
  
  // 获取当前配置以确定账号模式
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    const isMultiAccount = config.account?.multiAccountEnabled || false;
    
    // 保存到全局状态
    AppState.isMultiAccountMode = isMultiAccount;
    
    if (isMultiAccount) {
      // 多账号模式：显示完整的账号管理界面
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
    } else {
      // 单账号模式：显示简化的单账号信息
      accountsSection.innerHTML = `
        <h2>账号管理</h2>
        <div class="single-account-mode-notice">
          <div class="notice-icon">ℹ️</div>
          <div class="notice-text">当前为单账号模式，如需管理多个账号，请在「服务器配置」中启用多账号模式</div>
        </div>
        <div id="singleAccountContainer">
          <div class="loading">加载中...</div>
        </div>
      `;
    }
  } catch (error) {
    accountsSection.innerHTML = `
      <h2>账号管理</h2>
      <div class="error-message">加载配置失败: ${error.message}</div>
    `;
  }
}

// ============================================
// 加载服务器配置
// ============================================
let currentConfig = null;

async function loadConfig() {
  const container = document.getElementById('configContent');
  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const configResponse = await fetch('/api/config');
    
    const config = await configResponse.json();
    currentConfig = config;

    let html = '';

    // 配置编辑表单
    html += '<div class="config-editor">';
    html += '<div class="config-header">';
    html += '<h3>服务器配置</h3>';
    html += '<div class="config-actions">';
    html += '<button class="btn btn-primary" onclick="saveServerConfig()">💾 保存配置</button>';
    html += '</div></div>';

    // 服务器设置
    html += '<div class="config-section">';
    html += '<h4>🖥️ 服务器设置 <span class="restart-hint">⚠️ 修改后需重启服务器</span></h4>';
    html += '<div class="config-grid">';
    html += createInput('server.host', '监听地址', config.server?.host || '0.0.0.0', 'text', '服务器监听的 IP 地址（修改后需重启）');
    html += createInput('server.port', '端口', config.server?.port || 3000, 'number', '服务器监听的端口号（修改后需重启）');
    html += '</div></div>';

    // 流式响应设置
    html += '<div class="config-section">';
    html += '<h4>📡 流式响应</h4>';
    html += '<div class="config-grid">';
    html += createInput('stream.chunkSize', '块大小', config.stream?.chunkSize || 4, 'number', '流式响应每次发送的字符数');
    html += '</div></div>';

    // 账号设置
    const isMultiAccount = config.account?.multiAccountEnabled || false;
    html += '<div class="config-section">';
    html += '<h4>👥 账号设置 <span class="restart-hint">⚠️ 切换账号模式需重启</span></h4>';
    
    // 账号模式切换开关
    html += '<div class="account-mode-switch">';
    html += createCheckbox('account.multiAccountEnabled', '启用多账号模式', isMultiAccount);
    html += '</div>';
    
    // 认证配置状态（根据模式显示对应卡片）
    html += '<div id="authConfigStatus" class="auth-config-status">加载中...</div>';
    
    // 多账号专属设置（仅在多账号模式下显示）
    html += `<div id="multiAccountOptions" class="multi-account-options" style="display: ${isMultiAccount ? 'block' : 'none'}">`;
    html += '<div class="config-grid">';
    html += createSelect('account.strategy', '账号选择策略', config.account?.strategy || 'auto', [
      { value: 'auto', label: '自动选择 (auto)' },
      { value: 'round-robin', label: '轮询 (round-robin)' },
      { value: 'least-used', label: '最少使用 (least-used)' }
    ]);
    html += createCheckbox('account.autoSwitchOnError', '错误时自动切换账号', config.account?.autoSwitchOnError !== false);
    html += '</div></div>';
    
    html += '</div>';

    // Token 刷新设置
    html += '<div class="config-section">';
    html += '<h4>🔑 Token 刷新</h4>';
    html += '<div class="config-grid">';
    html += createInput('token.refreshRetryMax', '最大重试次数', config.token?.refreshRetryMax || 3, 'number', '刷新失败时的最大重试次数');
    html += createInput('token.refreshRetryIntervalMs', '重试间隔 (ms)', config.token?.refreshRetryIntervalMs || 60000, 'number', '重试之间的等待时间');
    html += createInput('token.refreshBufferMinutes', '提前刷新 (分钟)', config.token?.refreshBufferMinutes || 5, 'number', '在过期前多少分钟开始刷新');
    html += '</div></div>';

    // 连接池设置
    html += '<div class="config-section">';
    html += '<h4>🔗 连接池</h4>';
    html += '<div class="config-grid">';
    html += createInput('connectionPool.maxSockets', '最大连接数', config.connectionPool?.maxSockets || 20, 'number', '连接池最大连接数');
    html += createInput('connectionPool.maxFreeSockets', '空闲连接数', config.connectionPool?.maxFreeSockets || 10, 'number', '保持的空闲连接数');
    html += createInput('connectionPool.socketTimeout', '连接超时 (ms)', config.connectionPool?.socketTimeout || 60000, 'number', '连接超时时间');
    html += createInput('connectionPool.requestTimeout', '请求超时 (ms)', config.connectionPool?.requestTimeout || 30000, 'number', '请求超时时间');
    html += '</div></div>';

    // 日志设置
    html += '<div class="config-section">';
    html += '<h4>📝 日志设置</h4>';
    html += '<div class="config-grid">';
    html += createSelect('logging.level', '日志级别', config.logging?.level || 'INFO', [
      { value: 'DEBUG', label: 'DEBUG - 调试' },
      { value: 'INFO', label: 'INFO - 信息' },
      { value: 'WARN', label: 'WARN - 警告' },
      { value: 'ERROR', label: 'ERROR - 错误' }
    ]);
    html += createInput('logging.rotation.maxSize', '轮转大小 (字节)', config.logging?.rotation?.maxSize || 10485760, 'number', '单个日志文件最大大小');
    html += createInput('logging.rotation.maxFiles', '保留文件数', config.logging?.rotation?.maxFiles || 5, 'number', '保留的历史日志文件数量');
    html += '</div></div>';

    html += '</div>';

    container.innerHTML = html;
    
    // 延迟加载认证配置状态（等待 DOM 渲染）
    setTimeout(loadAuthConfigStatus, 100);
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载失败: ${error.message}</div>`;
  }
}

// 加载认证配置状态
async function loadAuthConfigStatus() {
  const container = document.getElementById('authConfigStatus');
  if (!container) return;
  
  try {
    const response = await fetch('/api/auth-config/status');
    const status = await response.json();
    
    // 获取当前多账号模式的选中状态
    const multiAccountCheckbox = document.getElementById('cfg-account.multiAccountEnabled');
    const isMultiAccountMode = multiAccountCheckbox ? multiAccountCheckbox.checked : (currentConfig?.account?.multiAccountEnabled || false);
    
    let html = '';
    
    if (isMultiAccountMode) {
      // 多账号模式：显示多账号配置卡片
      html += '<div class="auth-config-card-single">';
      html += '<div class="auth-config-header">';
      html += '<span class="auth-config-title">� 多账号配置</span>';
      html += `<span class="auth-config-badge ${status.multiAccount.valid ? 'badge-active' : 'badge-error'}">`;
      html += status.multiAccount.valid ? '✓ 已配置' : '✗ 未配置';
      html += '</span></div>';
      
      if (status.multiAccount.valid) {
        html += `<div class="auth-config-info">`;
        html += `<span>总账号数: ${status.multiAccount.count}</span>`;
        html += `<span class="auth-config-separator">|</span>`;
        html += `<span>活跃账号: ${status.multiAccount.activeCount}</span>`;
        html += '</div>';
      } else {
        html += '<div class="auth-config-info auth-config-warning">';
        html += '<span>⚠️ 需要配置 kiro-accounts.json 文件</span>';
        html += '</div>';
      }
      
      html += '<div class="auth-config-actions">';
      html += '<button class="btn btn-small" onclick="showUploadMultiDialog()">📁 上传配置</button>';
      html += '</div></div>';
    } else {
      // 单账号模式：显示单账号配置卡片
      html += '<div class="auth-config-card-single">';
      html += '<div class="auth-config-header">';
      html += '<span class="auth-config-title">� 单账号配置</span>';
      html += `<span class="auth-config-badge ${status.singleAccount.valid ? 'badge-active' : 'badge-error'}">`;
      html += status.singleAccount.valid ? '✓ 已配置' : '✗ 未配置';
      html += '</span></div>';
      
      if (status.singleAccount.valid && status.singleAccount.info) {
        html += `<div class="auth-config-info">`;
        html += `<span>认证方式: ${status.singleAccount.info.provider}</span>`;
        if (status.singleAccount.info.expiresAt) {
          const expDate = new Date(status.singleAccount.info.expiresAt);
          html += `<span class="auth-config-separator">|</span>`;
          html += `<span>过期时间: ${expDate.toLocaleString('zh-CN')}</span>`;
        }
        html += '</div>';
      } else {
        html += '<div class="auth-config-info auth-config-warning">';
        html += '<span>⚠️ 需要配置 kiro-auth-token.json 文件</span>';
        html += '</div>';
      }
      
      html += '<div class="auth-config-actions">';
      html += '<button class="btn btn-small" onclick="showUploadSingleDialog()">📁 上传配置</button>';
      html += '</div></div>';
    }
    
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载认证状态失败: ${error.message}</div>`;
  }
}

// 处理多账号模式切换
function onMultiAccountModeChange(checkbox) {
  const isMultiAccount = checkbox.checked;
  const multiAccountOptions = document.getElementById('multiAccountOptions');
  
  // 显示/隐藏多账号专属选项
  if (multiAccountOptions) {
    multiAccountOptions.style.display = isMultiAccount ? 'block' : 'none';
  }
  
  // 刷新认证配置卡片
  loadAuthConfigStatus();
}

// 显示上传单账号配置对话框
function showUploadSingleDialog() {
  showUploadDialog('single', '上传单账号配置', 'kiro-auth-token.json');
}

// 显示上传多账号配置对话框
function showUploadMultiDialog() {
  showUploadDialog('multi', '上传多账号配置', 'kiro-accounts.json');
}

// 通用上传对话框
function showUploadDialog(type, title, filename) {
  const existing = document.querySelector('.upload-dialog-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'upload-dialog-overlay';
  overlay.innerHTML = `
    <div class="upload-dialog">
      <div class="upload-dialog-header">
        <h3>${title}</h3>
        <button class="btn-close" onclick="closeUploadDialog()">✕</button>
      </div>
      <div class="upload-dialog-body">
        <p>上传 <code>${filename}</code> 文件或粘贴 JSON 内容：</p>
        <div class="upload-methods">
          <input type="file" id="uploadFile" accept=".json" onchange="handleFileSelect(this)" style="display:none" />
          <button class="btn" onclick="document.getElementById('uploadFile').click()">📁 选择文件</button>
          <span class="upload-or">或粘贴 JSON</span>
        </div>
        <textarea id="uploadJson" placeholder="粘贴 JSON 内容..."></textarea>
      </div>
      <div class="upload-dialog-footer">
        <button class="btn" onclick="closeUploadDialog()">取消</button>
        <button class="btn btn-primary" onclick="submitUpload('${type}')">上传</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// 关闭上传对话框
function closeUploadDialog() {
  const overlay = document.querySelector('.upload-dialog-overlay');
  if (overlay) overlay.remove();
}

// 处理文件选择
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('uploadJson').value = e.target.result;
  };
  reader.readAsText(file);
}

// 提交上传
async function submitUpload(type) {
  const jsonText = document.getElementById('uploadJson').value.trim();
  
  if (!jsonText) {
    showNotification('请选择文件或粘贴 JSON 内容', 'error');
    return;
  }
  
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    showNotification(`JSON 格式错误: ${e.message}`, 'error');
    return;
  }
  
  try {
    const endpoint = type === 'single' ? '/api/auth-config/single' : '/api/auth-config/multi';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification(result.message, 'success');
      closeUploadDialog();
      loadAuthConfigStatus();
    } else {
      showNotification(`上传失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showNotification(`上传失败: ${error.message}`, 'error');
  }
}

// 创建输入框
function createInput(path, label, value, type, hint) {
  return `
    <div class="config-field">
      <label for="cfg-${path}">${label}</label>
      <input type="${type}" id="cfg-${path}" data-path="${path}" value="${value}" />
      ${hint ? `<span class="field-hint">${hint}</span>` : ''}
    </div>
  `;
}

// 创建复选框
function createCheckbox(path, label, checked) {
  // 为多账号模式复选框添加 onchange 事件
  const onchangeAttr = path === 'account.multiAccountEnabled' ? 'onchange="onMultiAccountModeChange(this)"' : '';
  return `
    <div class="config-field checkbox-field">
      <label class="checkbox-label">
        <input type="checkbox" id="cfg-${path}" data-path="${path}" ${checked ? 'checked' : ''} ${onchangeAttr} />
        <span class="checkbox-text">${label}</span>
      </label>
    </div>
  `;
}

// 创建下拉框
function createSelect(path, label, value, options) {
  const optionsHtml = options.map(opt => 
    `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>`
  ).join('');
  return `
    <div class="config-field">
      <label for="cfg-${path}">${label}</label>
      <select id="cfg-${path}" data-path="${path}">${optionsHtml}</select>
    </div>
  `;
}

// 从表单收集配置
function collectConfigFromForm() {
  const config = JSON.parse(JSON.stringify(currentConfig || {}));
  
  document.querySelectorAll('[data-path]').forEach(el => {
    const path = el.dataset.path;
    const parts = path.split('.');
    let obj = config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    
    const key = parts[parts.length - 1];
    if (el.type === 'checkbox') {
      obj[key] = el.checked;
    } else if (el.type === 'number') {
      obj[key] = parseInt(el.value, 10) || 0;
    } else {
      obj[key] = el.value;
    }
  });
  
  return config;
}

// 保存服务器配置
async function saveServerConfig() {
  try {
    const config = collectConfigFromForm();
    
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    const result = await response.json();
    
    if (result.success) {
      currentConfig = config;
      
      if (result.needsRestart) {
        // 显示重启确认对话框
        showRestartDialog();
      } else {
        showNotification('配置已保存并生效', 'success');
      }
    } else {
      showNotification(`保存失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showNotification(`保存失败: ${error.message}`, 'error');
  }
}

// 显示重启确认对话框
function showRestartDialog() {
  const existing = document.querySelector('.restart-dialog-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'restart-dialog-overlay';
  overlay.innerHTML = `
    <div class="restart-dialog">
      <div class="restart-dialog-icon">⚠️</div>
      <h3>需要重启服务器</h3>
      <p>您修改了以下配置，需要重启服务器才能生效：</p>
      <ul>
        <li>服务器地址/端口</li>
        <li>账号模式切换</li>
      </ul>
      <div class="restart-dialog-actions">
        <button class="btn" onclick="closeRestartDialog()">稍后重启</button>
        <button class="btn btn-danger" onclick="restartServer()">立即重启</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// 关闭重启对话框
function closeRestartDialog() {
  const overlay = document.querySelector('.restart-dialog-overlay');
  if (overlay) overlay.remove();
  showNotification('配置已保存，请手动重启服务器', 'info');
}

// 重启服务器
async function restartServer() {
  const overlay = document.querySelector('.restart-dialog-overlay');
  if (overlay) {
    overlay.querySelector('.restart-dialog').innerHTML = `
      <div class="restart-dialog-icon">🔄</div>
      <h3>正在重启...</h3>
      <p>服务器正在重启，页面将自动刷新</p>
    `;
  }
  
  try {
    await fetch('/api/server/restart', { method: 'POST' });
  } catch (e) {
    // 请求可能因服务器关闭而失败，这是正常的
  }
  
  // 等待服务器重启后刷新页面
  setTimeout(() => {
    waitForServerAndReload();
  }, 2000);
}

// 等待服务器恢复并刷新
async function waitForServerAndReload() {
  const maxAttempts = 30;
  let attempts = 0;
  
  const check = async () => {
    attempts++;
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        window.location.reload();
        return;
      }
    } catch (e) {
      // 服务器还没恢复
    }
    
    if (attempts < maxAttempts) {
      setTimeout(check, 1000);
    } else {
      showNotification('服务器重启超时，请手动刷新页面', 'error');
      closeRestartDialog();
    }
  };
  
  check();
}



// ============================================
// 加载模型映射
// ============================================
let currentModelsConfig = null;

async function loadModels() {
  const container = document.getElementById('modelsContent');
  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    currentModelsConfig = data;

    let html = '<div class="config-editor">';
    html += '<div class="config-header">';
    html += '<h3>模型映射配置</h3>';
    html += '<div class="config-actions">';
    html += '<button class="btn btn-success" onclick="addModelMapping()">➕ 添加映射</button>';
    html += '<button class="btn btn-primary" onclick="saveModelsConfig()">💾 保存配置</button>';
    html += '</div></div>';

    // 默认模型
    html += '<div class="config-section">';
    html += '<h4>🎯 默认模型</h4>';
    html += '<div class="config-grid">';
    html += createSelect('models.defaultModel', '默认模型', data.defaultModel || 'claude-sonnet-4.5', [
      { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
      { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
      { value: 'claude-opus-4.5', label: 'Claude Opus 4.5' }
    ]);
    html += '</div></div>';

    // 模型映射表
    html += '<div class="config-section">';
    html += '<h4>🔄 模型映射表</h4>';
    html += '<p class="section-desc">将 Claude API 请求的模型 ID 映射到 Kiro API 的模型 ID</p>';
    html += '<div id="modelMappingsContainer">';
    
    const mappings = data.mappings || {};
    Object.entries(mappings).forEach(([claudeModel, kiroModel], index) => {
      html += createMappingRow(index, claudeModel, kiroModel);
    });
    
    html += '</div></div>';
    html += '</div>';

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-message">加载失败: ${error.message}</div>`;
  }
}

// 创建映射行
function createMappingRow(index, claudeModel, kiroModel) {
  return `
    <div class="mapping-row" data-index="${index}">
      <input type="text" class="mapping-input claude-model" placeholder="Claude 模型 ID" value="${claudeModel}" />
      <span class="mapping-arrow">→</span>
      <select class="mapping-input kiro-model">
        <option value="claude-sonnet-4.5" ${kiroModel === 'claude-sonnet-4.5' ? 'selected' : ''}>claude-sonnet-4.5</option>
        <option value="claude-haiku-4.5" ${kiroModel === 'claude-haiku-4.5' ? 'selected' : ''}>claude-haiku-4.5</option>
        <option value="claude-opus-4.5" ${kiroModel === 'claude-opus-4.5' ? 'selected' : ''}>claude-opus-4.5</option>
      </select>
      <button class="btn-icon btn-delete" onclick="removeMapping(this)" title="删除">🗑️</button>
    </div>
  `;
}

// 添加模型映射
function addModelMapping() {
  const container = document.getElementById('modelMappingsContainer');
  const index = container.querySelectorAll('.mapping-row').length;
  const html = createMappingRow(index, '', 'claude-sonnet-4.5');
  container.insertAdjacentHTML('beforeend', html);
}

// 删除映射
function removeMapping(btn) {
  btn.closest('.mapping-row').remove();
}

// 收集模型配置
function collectModelsConfig() {
  const config = {
    defaultModel: document.getElementById('cfg-models.defaultModel')?.value || 'claude-sonnet-4.5',
    mappings: {},
    description: currentModelsConfig?.description || 'Claude API 模型 ID 到 Kiro API 模型 ID 的映射配置',
    notes: currentModelsConfig?.notes || {}
  };
  
  document.querySelectorAll('.mapping-row').forEach(row => {
    const claudeModel = row.querySelector('.claude-model').value.trim();
    const kiroModel = row.querySelector('.kiro-model').value;
    if (claudeModel) {
      config.mappings[claudeModel] = kiroModel;
    }
  });
  
  return config;
}

// 保存模型配置
async function saveModelsConfig() {
  try {
    const config = collectModelsConfig();
    
    const response = await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification('模型映射已保存并生效', 'success');
      currentModelsConfig = config;
    } else {
      showNotification(`保存失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showNotification(`保存失败: ${error.message}`, 'error');
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
  // 初始化账号管理区域（异步）
  await initAccountsSection();

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
