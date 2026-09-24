// client/admin.js
(function () {
  'use strict';

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
  function show(viewId) {
    ['view-login', 'view-main'].forEach((v) => $(v).classList.toggle('hidden', v !== viewId));
  }

  // PUBLIC_PORT default 3000; spec assumes same hostname
  const publicBase = `${location.protocol}//${location.hostname}:3000`;

  // ── Login ─────────────────────────────────────────────
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

  function enterMain() {
    show('view-main');
    $('preview-frame').src = `${publicBase}/`;
    $('site-meta').textContent = '正在加载…';
    fetch(`${publicBase}/`, { method: 'HEAD' }).then((r) => {
      $('site-meta').textContent = r.ok ? `上次更新：${new Date().toLocaleString('zh-CN')}` : '尚未上传站点';
    });
  }

  // Auto-redirect if session valid (try upload endpoint — 401 = not logged in)
  api('/api/upload', { method: 'POST' }).then(
    () => show('view-main'),
    (err) => { if (err.status !== 401) show('view-main'); else show('view-login'); }
  );

  // ── Logout ────────────────────────────────────────────
  $('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    show('view-login');
  });

  // ── Upload ────────────────────────────────────────────
  const dropZone = $('drop-zone');
  const fileInput = $('upload-file');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      doUpload();
    }
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) doUpload(); });

  async function doUpload() {
    const file = fileInput.files[0];
    if (!file) return;
    const errBox = $('upload-error');
    errBox.classList.add('hidden');
    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.onload = () => {
      if (xhr.status === 201) {
        $('preview-frame').src = `${publicBase}/?t=${Date.now()}`;
        $('site-meta').textContent = `上传于：${new Date().toLocaleString('zh-CN')}`;
        fileInput.value = '';
      } else {
        const ERR_ZH = {
          INVALID_FILE_TYPE: '只能上传 .zip 文件。',
          FILE_TOO_LARGE: '文件超过 100MB 限制。',
          PATH_TRAVERSAL: 'ZIP 内包含非法路径，已拒绝。',
          INVALID_ZIP: 'ZIP 文件损坏。',
        };
        let msg = '上传失败。';
        try { msg = ERR_ZH[JSON.parse(xhr.responseText).message] || msg; } catch (_) {}
        errBox.textContent = msg;
        errBox.classList.remove('hidden');
      }
    };
    xhr.send(fd);
  }

  // ── Password drawer ──────────────────────────────────
  $('btn-password').addEventListener('click', () => {
    $('panel-password').classList.remove('hidden');
    requestAnimationFrame(() => $('panel-password').classList.add('open'));
  });
  $('btn-password-close').addEventListener('click', closePasswordDrawer);

  function closePasswordDrawer() {
    $('panel-password').classList.remove('open');
    setTimeout(() => $('panel-password').classList.add('hidden'), 200);
  }

  $('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('password-error');
    errBox.classList.add('hidden');
    const newPwd = $('new-password').value;
    const confirmPwd = $('confirm-password').value;
    if (newPwd !== confirmPwd) {
      errBox.textContent = '两次输入的密码不一致';
      errBox.classList.remove('hidden');
      return;
    }
    try {
      await api('/api/password', {
        method: 'PUT',
        body: JSON.stringify({ newPassword: newPwd }),
      });
      closePasswordDrawer();
      $('new-password').value = '';
      $('confirm-password').value = '';
    } catch (err) {
      errBox.textContent = err.code === 'INVALID_PASSWORD' ? '密码长度至少 6 位' : '保存失败';
      errBox.classList.remove('hidden');
    }
  });
})();