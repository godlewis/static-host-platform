// 管理界面逻辑：视图切换 + API 封装 + 各模态框
(function () {
  'use strict';

  // ── API 封装 ───────────────────────────────────────────
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'REQUEST_FAILED');
      err.status = res.status;
      err.code = data.message;
      throw err;
    }
    return data;
  }

  const $ = (id) => document.getElementById(id);
  const VIEWS = ['view-login', 'view-forgot', 'view-reset', 'view-main'];
  function show(viewId) {
    VIEWS.forEach((v) => $(v).classList.toggle('hidden', v !== viewId));
  }

  // 公开端口地址（同主机不同端口，开发环境 3000）
  const publicBase = `${location.protocol}//${location.hostname}:3000`;

  // ── 登录 ───────────────────────────────────────────────
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').classList.add('hidden');
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          username: $('login-username').value,
          password: $('login-password').value,
        }),
      });
      enterMain();
    } catch (err) {
      $('login-error').textContent = '用户名或密码错误';
      $('login-error').classList.remove('hidden');
    }
  });

  // ── 忘记密码 ───────────────────────────────────────────
  $('link-forgot').addEventListener('click', (e) => { e.preventDefault(); show('view-forgot'); });
  $('link-back-login').addEventListener('click', (e) => { e.preventDefault(); show('view-login'); });
  $('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('forgot-msg');
    msg.classList.remove('hidden', 'text-red-600', 'bg-red-50', 'text-green-700', 'bg-green-50');
    try {
      await api('/api/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: $('forgot-email').value }),
      });
      msg.textContent = '如果该邮箱已注册，重置链接已发送（SMTP 未配置时请联系管理员）。';
      msg.classList.add('text-green-700', 'bg-green-50');
    } catch (err) {
      msg.textContent = '发送失败，请稍后再试。';
      msg.classList.add('text-red-600', 'bg-red-50');
    }
  });

  // ── 重置密码（URL 带 ?token=）─────────────────────────
  const resetToken = new URLSearchParams(location.search).get('token');
  if (resetToken) show('view-reset');
  $('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: $('reset-password').value }),
      });
      location.href = '/'; // 成功后回登录页
    } catch (err) {
      $('reset-error').textContent = err.code === 'INVALID_TOKEN' ? '链接无效或已过期' : '重置失败';
      $('reset-error').classList.remove('hidden');
    }
  });

  // ── 主界面 ─────────────────────────────────────────────
  let sites = [];
  let pendingDeleteSlug = null;
  let editingSlug = null;

  async function enterMain() {
    show('view-main');
    await refreshSites();
  }

  async function refreshSites() {
    const data = await api('/api/sites');
    sites = data.sites;
    renderSites();
  }

  function renderSites() {
    const q = $('search').value.trim().toLowerCase();
    const list = sites.filter((s) =>
      s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q));
    $('empty-hint').classList.toggle('hidden', list.length > 0);
    $('site-grid').innerHTML = list.map((s) => `
      <div class="bg-white rounded-lg shadow p-4 flex flex-col">
        <iframe src="${publicBase}/sites/${s.slug}" sandbox class="w-full h-40 rounded border bg-white pointer-events-none"></iframe>
        <h3 class="font-bold mt-3">${escapeHtml(s.title)}</h3>
        <p class="text-sm text-gray-500 flex-1">${escapeHtml(s.description || '')}</p>
        <p class="text-xs text-gray-400 mt-2">${s.created_at}</p>
        <div class="flex gap-2 mt-3">
          <button data-act="preview" data-slug="${s.slug}" class="flex-1 py-1.5 text-sm bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">预览</button>
          <button data-act="edit" data-slug="${s.slug}" class="flex-1 py-1.5 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200">编辑</button>
          <button data-act="delete" data-slug="${s.slug}" class="flex-1 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100">删除</button>
        </div>
      </div>`).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  $('search').addEventListener('input', renderSites);
  $('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });

  // ── 上传模态框 ─────────────────────────────────────────
  const dropZone = $('drop-zone');
  $('btn-upload').addEventListener('click', () => {
    $('modal-upload').classList.remove('hidden');
    $('upload-error').classList.add('hidden');
    $('upload-progress').classList.add('hidden');
  });
  $('upload-cancel').addEventListener('click', () => $('modal-upload').classList.add('hidden'));
  dropZone.addEventListener('click', () => $('upload-file').click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-400'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-400'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-400');
    if (e.dataTransfer.files.length) $('upload-file').files = e.dataTransfer.files;
  });

  $('upload-submit').addEventListener('click', () => {
    const file = $('upload-file').files[0];
    const title = $('upload-title').value.trim();
    const slug = $('upload-slug').value.trim();
    const errBox = $('upload-error');
    errBox.classList.add('hidden');
    if (!file || !title || !slug) {
      errBox.textContent = '请填写标题、slug 并选择 ZIP 文件。';
      errBox.classList.remove('hidden');
      return;
    }
    // XHR 以获得上传中状态（fetch 无上传进度）
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title);
    fd.append('slug', slug);
    fd.append('description', $('upload-desc').value.trim());
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/sites');
    $('upload-progress').classList.remove('hidden');
    xhr.onload = async () => {
      $('upload-progress').classList.add('hidden');
      if (xhr.status === 201) {
        $('modal-upload').classList.add('hidden');
        ['upload-title', 'upload-slug', 'upload-desc'].forEach((id) => { $(id).value = ''; });
        $('upload-file').value = '';
        await refreshSites();
      } else {
        const ERR_ZH = {
          DUPLICATE_SLUG: 'slug 已存在，换一个吧。',
          INVALID_SLUG: 'slug 只能是字母、数字和连字符。',
          INVALID_FILE_TYPE: '只能上传 .zip 文件。',
          FILE_TOO_LARGE: '文件超过 100MB 限制。',
          PATH_TRAVERSAL: 'ZIP 内包含非法路径，已拒绝。',
          MISSING_FIELDS: '请填写标题、slug 并选择 ZIP 文件。',
        };
        let msg = '上传失败。';
        try { msg = ERR_ZH[JSON.parse(xhr.responseText).message] || msg; } catch (_) { /* 保持默认 */ }
        errBox.textContent = msg;
        errBox.classList.remove('hidden');
      }
    };
    xhr.onerror = () => {
      $('upload-progress').classList.add('hidden');
      errBox.textContent = '网络错误，上传失败。';
      errBox.classList.remove('hidden');
    };
    xhr.send(fd);
  });

  // ── 卡片操作（事件委托）───────────────────────────────
  $('site-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const slug = btn.dataset.slug;
    const site = sites.find((s) => s.slug === slug);
    if (btn.dataset.act === 'preview') {
      $('preview-title').textContent = site.title;
      $('preview-frame').src = `${publicBase}/sites/${slug}`;
      $('modal-preview').classList.remove('hidden');
    } else if (btn.dataset.act === 'edit') {
      editingSlug = slug;
      $('edit-title').value = site.title;
      $('edit-desc').value = site.description || '';
      $('edit-slug').value = site.slug;
      $('edit-error').classList.add('hidden');
      $('modal-edit').classList.remove('hidden');
    } else if (btn.dataset.act === 'delete') {
      pendingDeleteSlug = slug;
      $('confirm-name').textContent = site.title;
      $('modal-confirm').classList.remove('hidden');
    }
  });

  // ── 编辑模态框 ─────────────────────────────────────────
  $('edit-cancel').addEventListener('click', () => $('modal-edit').classList.add('hidden'));
  $('edit-save').addEventListener('click', async () => {
    try {
      await api(`/api/sites/${encodeURIComponent(editingSlug)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: $('edit-title').value.trim(),
          description: $('edit-desc').value.trim(),
          slug: $('edit-slug').value.trim(),
        }),
      });
      $('modal-edit').classList.add('hidden');
      await refreshSites();
    } catch (err) {
      const ERR_ZH = { DUPLICATE_SLUG: '新 slug 已被占用。', INVALID_SLUG: 'slug 格式不合法。', SITE_NOT_FOUND: '站点不存在。' };
      $('edit-error').textContent = ERR_ZH[err.code] || '保存失败。';
      $('edit-error').classList.remove('hidden');
    }
  });

  // ── 预览 / 删除确认 ───────────────────────────────────
  $('preview-close').addEventListener('click', () => {
    $('preview-frame').src = 'about:blank';
    $('modal-preview').classList.add('hidden');
  });
  $('confirm-cancel').addEventListener('click', () => $('modal-confirm').classList.add('hidden'));
  $('confirm-delete').addEventListener('click', async () => {
    await api(`/api/sites/${encodeURIComponent(pendingDeleteSlug)}`, { method: 'DELETE' }).catch(() => {});
    $('modal-confirm').classList.add('hidden');
    await refreshSites();
  });

  // ── 入口：有 token 走重置视图；否则探测登录态 ─────────
  if (!resetToken) {
    api('/api/sites').then(enterMain).catch(() => show('view-login'));
  }
})();
