export const ui = {
  _els: {},
  _toastTimer: null,

  init() {
    this._els.screens = {
      home: document.getElementById('screen-home'),
      wait: document.getElementById('screen-wait'),
      transfer: document.getElementById('screen-transfer'),
    };
    this._els.statusPill = document.getElementById('statusPill');
    this._els.statusText = document.getElementById('statusText');
    this._els.roomCode = document.getElementById('roomCode');
    this._els.connLabel = document.getElementById('connLabel');
    this._els.transferList = document.getElementById('transferList');
    this._els.transferCount = document.getElementById('transferCount');
    this._els.toast = document.getElementById('toast');
  },

  showScreen(name) {
    Object.values(this._els.screens).forEach(s => s.classList.remove('active'));
    if (this._els.screens[name]) this._els.screens[name].classList.add('active');
  },

  setStatus(text, state = 'idle') {
    this._els.statusText.textContent = text;
    this._els.statusPill.className = 'status-pill' + (state !== 'idle' ? ' ' + state : '');
  },

  toast(msg, isError = true) {
    const t = this._els.toast;
    t.textContent = msg;
    t.style.borderColor = isError ? 'rgba(255,77,109,0.4)' : 'rgba(34,211,160,0.4)';
    t.style.color = isError ? '#ffb8c4' : '#a0f0d0';
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  },

  showRoomCode(code) {
    this._els.roomCode.textContent = code;
  },

  setConnLabel(text) {
    this._els.connLabel.textContent = text;
  },

  formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  },

  addTransferItem({ id, name, size, direction }) {
    const empty = this._els.transferList.querySelector('.empty-state');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'transfer-item';
    item.dataset.transferId = id;
    item.dataset.direction = direction;

    const iconSvg = `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

    item.innerHTML = `
      <div class="file-icon">${iconSvg}</div>
      <div class="file-info">
        <div class="file-name"></div>
        <div class="file-meta">
          <span class="file-direction"></span> &middot;
          <span class="file-size"></span> &middot;
          <span class="file-progress">0%</span>
        </div>
        <div class="progress-track"><div class="progress-fill"></div></div>
      </div>
      <div class="file-action"></div>
    `;

    item.querySelector('.file-name').textContent = name;
    item.querySelector('.file-direction').textContent = direction === 'send' ? 'Dikirim' : 'Diterima';
    item.querySelector('.file-size').textContent = this.formatBytes(size);

    this._els.transferList.appendChild(item);
    this._updateCount();
  },

  updateProgress(id, bytesDone, bytesTotal) {
    const item = this._els.transferList.querySelector(`[data-transfer-id="${id}"]`);
    if (!item) return;
    const pct = bytesTotal > 0 ? (bytesDone / bytesTotal * 100) : 0;
    item.querySelector('.progress-fill').style.width = pct.toFixed(1) + '%';
    item.querySelector('.file-progress').textContent = pct.toFixed(0) + '%';
  },

  completeTransfer(id, direction, onSave) {
    const item = this._els.transferList.querySelector(`[data-transfer-id="${id}"]`);
    if (!item) return;
    item.querySelector('.progress-fill').style.width = '100%';
    item.querySelector('.file-progress').textContent = '100%';

    const action = item.querySelector('.file-action');
    action.innerHTML = '';

    if (direction === 'receive' && typeof onSave === 'function') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary small';
      btn.type = 'button';
      btn.textContent = 'Simpan';
      btn.addEventListener('click', onSave);
      action.appendChild(btn);
    } else {
      const check = document.createElement('div');
      check.className = 'done-check';
      check.textContent = '✓';
      action.appendChild(check);
    }
  },

  clearTransfers() {
    this._els.transferList.innerHTML = '<div class="empty-state">Belum ada transfer</div>';
    this._updateCount();
  },

  _updateCount() {
    const n = this._els.transferList.querySelectorAll('.transfer-item').length;
    this._els.transferCount.textContent = n + ' file';
  },
};