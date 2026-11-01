import { CONFIG } from './config.js';

export class FileTransfer {
  constructor(peerManager, ui) {
    this.peer = peerManager;
    this.ui = ui;
    this.queue = [];
    this.processing = false;
    this.receiving = null;
    this._bound = false;
  }

  _log(...a) { if (CONFIG.DEBUG) console.log('[Transfer]', ...a); }

  init() {
    if (this._bound) return;
    this._bound = true;
    this.peer.on('data', data => this._handleData(data));
    this.peer.on('close', () => this._onConnectionClose());
  }

  addFiles(fileList) {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    for (const f of arr) this.queue.push(f);
    this._log('queued', arr.length, 'file(s)');
    this._processNext();
  }

  async _processNext() {
    if (this.processing) return;
    if (!this.queue.length) return;

    const file = this.queue.shift();
    this.processing = true;

    try {
      await this._sendFile(file);
    } catch (e) {
      console.error('[Transfer] send failed', e);
      this.ui.toast('Gagal kirim file: ' + (e && e.message || 'unknown'));
    }

    this.processing = false;
    if (this.queue.length) this._processNext();
  }

  async _sendFile(file) {
    if (!this.peer.isOpen()) throw new Error('Koneksi tidak aktif');

    const id = this._genId();
    const meta = {
      type: 'file-start',
      id,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
    };

    this._log('sending file-start', meta);

    this.ui.addTransferItem({ id, name: file.name, size: file.size, direction: 'send' });

    if (!this.peer.send(JSON.stringify(meta))) throw new Error('Gagal kirim meta');

    let offset = 0;
    const CHUNK = CONFIG.CHUNK_SIZE;
    const dc = this.peer.dataChannel;

    while (offset < file.size) {
      if (!this.peer.isOpen()) throw new Error('Koneksi terputus');

      const end = Math.min(offset + CHUNK, file.size);
      const slice = file.slice(offset, end);
      const buf = await slice.arrayBuffer();

      if (dc) await this._waitForDrain(dc);

      if (!this.peer.send(buf)) throw new Error('Koneksi terputus');

      offset = end;
      this.ui.updateProgress(id, offset, file.size);
    }

    this._log('sending file-end', id);
    this.peer.send(JSON.stringify({ type: 'file-end', id }));
    this.ui.completeTransfer(id, 'send');
  }

  _waitForDrain(dc) {
    const HIGH = CONFIG.BUFFER_HIGH;
    const LOW = CONFIG.BUFFER_LOW;
    if (dc.bufferedAmount < HIGH) return Promise.resolve();

    return new Promise(resolve => {
      dc.bufferedAmountLowThreshold = LOW;
      let poll = null;
      const cleanup = () => {
        dc.removeEventListener('bufferedamountlow', check);
        if (poll) clearInterval(poll);
      };
      const check = () => {
        if (dc.bufferedAmount <= LOW) { cleanup(); resolve(); }
      };
      dc.addEventListener('bufferedamountlow', check);
      poll = setInterval(check, 80);
    });
  }

  _handleData(data) {
    try {
      if (typeof data === 'string') {
        let msg;
        try { msg = JSON.parse(data); } catch (e) { return; }
        if (msg && typeof msg.type === 'string') this._handleControl(msg);
        return;
      }

      if (data instanceof ArrayBuffer) {
        this._handleChunk(data);
        return;
      }

      if (data instanceof Uint8Array) {
        this._handleChunk(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        return;
      }

      if (data && data.buffer instanceof ArrayBuffer && typeof data.byteLength === 'number') {
        const off = data.byteOffset || 0;
        this._handleChunk(data.buffer.slice(off, off + data.byteLength));
        return;
      }

      if (data && typeof data === 'object' && typeof data.type === 'string') {
        this._handleControl(data);
        return;
      }

      this._log('unknown data type', typeof data, data);
    } catch (e) {
      console.error('[Transfer] handleData error', e);
    }
  }

  _handleControl(msg) {
    this._log('control', msg.type, msg.id);

    if (msg.type === 'file-start') {
      this.receiving = {
        id: msg.id,
        name: msg.name,
        size: msg.size,
        mime: msg.mime,
        chunks: [],
        bytesReceived: 0,
      };
      this.ui.addTransferItem({
        id: msg.id,
        name: msg.name,
        size: msg.size,
        direction: 'receive',
      });
    } else if (msg.type === 'file-end') {
      const r = this.receiving;
      if (!r || r.id !== msg.id) {
        this._log('file-end without matching receiving', msg.id);
        return;
      }

      const blob = new Blob(r.chunks, { type: r.mime });
      this._log('blob ready', r.name, blob.size, 'bytes');

      this.ui.completeTransfer(r.id, 'receive', () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = r.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });

      this.receiving = null;
    }
  }

  _handleChunk(buf) {
    if (!this.receiving) return;
    if (!(buf instanceof ArrayBuffer)) return;

    this.receiving.chunks.push(buf);
    this.receiving.bytesReceived += buf.byteLength;
    this.ui.updateProgress(
      this.receiving.id,
      this.receiving.bytesReceived,
      this.receiving.size
    );
  }

  _onConnectionClose() {
    this.queue = [];
    this.processing = false;
    this.receiving = null;
  }

  reset() {
    this.queue = [];
    this.processing = false;
    this.receiving = null;
  }

  _genId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (e) {}
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
}