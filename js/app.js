import { CONFIG } from './config.js';
import { PeerManager } from './peer-manager.js';
import { FileTransfer } from './file-transfer.js';
import { ui } from './ui.js';

class App {
  constructor() {
    this.peer = null;
    this.transfer = null;
    this.role = null;
    this.roomCode = null;
  }

  init() {
    ui.init();
    this._bindAll();
  }

  _bindAll() {
    document.getElementById('btnHost').addEventListener('click', () => this.hostRoom());

    const joinBtn = document.getElementById('btnJoin');
    const joinInput = document.getElementById('joinInput');

    joinBtn.addEventListener('click', () => {
      const code = joinInput.value.trim().toUpperCase();
      if (code.length !== CONFIG.CODE_LENGTH) {
        ui.toast('Kode harus ' + CONFIG.CODE_LENGTH + ' karakter');
        return;
      }
      this.joinRoom(code);
    });

    joinInput.addEventListener('input', e => {
      e.target.value = e.target.value
        .replace(/[^A-Z0-9]/gi, '')
        .toUpperCase()
        .slice(0, CONFIG.CODE_LENGTH);
    });

    joinInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') joinBtn.click();
    });

    document.getElementById('btnCancelWait').addEventListener('click', () => this.disconnect());
    document.getElementById('btnDisconnect').addEventListener('click', () => this.disconnect());

    const fileInput = document.getElementById('fileInput');
    const btnPick = document.getElementById('btnPickFile');
    const dropCard = document.getElementById('dropCard');

    btnPick.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
    dropCard.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', e => {
      if (e.target.files.length && this.transfer) this.transfer.addFiles(e.target.files);
      e.target.value = '';
    });

    dropCard.addEventListener('dragover', e => {
      e.preventDefault();
      dropCard.classList.add('drag-over');
    });
    dropCard.addEventListener('dragleave', e => {
      if (!dropCard.contains(e.relatedTarget)) dropCard.classList.remove('drag-over');
    });
    dropCard.addEventListener('drop', e => {
      e.preventDefault();
      dropCard.classList.remove('drag-over');
      if (e.dataTransfer.files.length && this.transfer) {
        this.transfer.addFiles(e.dataTransfer.files);
      }
    });

    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => e.preventDefault());
  }

  async hostRoom() {
    ui.setStatus('Menyiapkan...', 'wait');

    for (let attempt = 0; attempt < CONFIG.MAX_HOST_ATTEMPTS; attempt++) {
      const code = this._generateCode();
      const pm = new PeerManager();

      try {
        await pm.host(code);
        this._setupConnection(pm, 'host');
        this.roomCode = code;
        ui.showRoomCode(code);
        ui.showScreen('wait');
        ui.setStatus('Menunggu', 'wait');
        return;
      } catch (e) {
        try { pm.destroy(); } catch (_) {}
        if (e && e.type === 'unavailable-id') continue;
        console.error('[App] host failed', e);
        ui.toast('Gagal buat room: ' + (e && e.message || 'unknown'));
        ui.setStatus('Siap', 'idle');
        ui.showScreen('home');
        return;
      }
    }

    ui.toast('Kode room bentrok terus, coba lagi');
    ui.setStatus('Siap', 'idle');
  }

  async joinRoom(code) {
    ui.setStatus('Menghubungi...', 'busy');
    const pm = new PeerManager();

    try {
      await pm.join(code);
      this._setupConnection(pm, 'guest');
      this.roomCode = code;
    } catch (e) {
      console.error('[App] join failed', e);
      const msg =
        e && e.type === 'peer-unavailable'
          ? 'Kode tidak ditemukan atau sudah tidak aktif'
          : e && e.message === 'timeout'
            ? 'Timeout, cek koneksi'
            : 'Gagal terhubung: ' + (e && e.message || 'unknown');
      ui.toast(msg);
      ui.setStatus('Siap', 'idle');
      try { pm.destroy(); } catch (_) {}
    }
  }

  _setupConnection(pm, role) {
    this.peer = pm;
    this.role = role;

    const transfer = new FileTransfer(pm, ui);
    transfer.init();
    this.transfer = transfer;

    const onOpen = () => {
      ui.setStatus('Terhubung', 'online');
      ui.setConnLabel('Terhubung');
      ui.showScreen('transfer');
    };

    pm.on('open', onOpen);

    pm.on('close', () => {
      ui.toast('Koneksi terputus');
      this.reset();
    });

    pm.on('peer-disconnected', () => ui.setConnLabel('Terputus'));
    pm.on('peer-close', () => this.reset());
    pm.on('error', err => console.warn('[App] peer error', err && err.type));

    // FIX: kalau koneksi sudah open sebelum handler ini terpasang (race di guest),
    // panggil onOpen langsung
    if (pm.isOpen()) {
      onOpen();
    }
  }

  disconnect() {
    if (this.transfer) this.transfer.reset();
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.transfer = null;
    this.role = null;
    this.roomCode = null;
    ui.clearTransfers();
    ui.setStatus('Siap', 'idle');
    ui.showScreen('home');
  }

  reset() {
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.peer = null;
    this.transfer = null;
    this.role = null;
    this.roomCode = null;
    ui.clearTransfers();
    ui.setStatus('Siap', 'idle');
    ui.showScreen('home');
  }

  _generateCode() {
    const alphabet = CONFIG.CODE_ALPHABET;
    const len = CONFIG.CODE_LENGTH;
    let out = '';

    try {
      const arr = new Uint8Array(len);
      crypto.getRandomValues(arr);
      for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
      return out;
    } catch (e) {
      for (let i = 0; i < len; i++) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      return out;
    }
  }
}

const app = new App();
app.init();