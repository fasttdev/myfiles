import { CONFIG } from './config.js';

export class FileTransfer {
  constructor(peerManager, ui) {
    this.peer = peerManager;
    this.ui = ui;
    this.queue = [];
    this.processing = false;
    this.receiving = null;
    this.currentSendId = null;
    this._bound = false;
  }

  init() {
    if (this._bound) return;
    this._bound = true;
    this.peer.on('data', data => this._handleData(data));
    this.peer.on('close', () => this._onConnectionClose());
  }

  addFiles(fileList) {
    for (const f of fileList) this.queue.push(f);
    this._processNext();
  }

  async _processNext() {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    const file = this.queue.shift();
    this.processing = true;

    try {
      await this._sendFile(file);
    } catch (e) {
      console.error('[FileTransfer]', e);
      this.ui.toast('Gagal mengirim file: ' + (e?.message || 'unknown'));
    }

    this.processing = false;
    if (this.queue.length > 0) this._processNext();
  }

  async _sendFile(file) {
    if (!this.peer.isOpen()) throw new Error('Koneksi tidak aktif');

    const id = this._genId();
    this.currentSendId = id;

    const meta = {
      type: 'file-start',
      id,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
    };

    this.ui.addTransferItem({ id, name: file.name, size: file.size, direction: 'send' });

    if (!this.peer.send(meta)) throw new Error('Koneksi terputus');

    let offset = 0;
    const CHUNK = CONFIG.CHUNK_SIZE;
    const dc = this.peer.dataChannel;

    while (offset < file.size) {
      if (!this.peer.isOpen()) throw new Error('Koneksi terputus');

      const end = Math.min(offset + CHUNK, file.size);
      const slice = file.slice(offset, end);
      const buf = await slice.arrayBuffer();

      if (dc) await this._waitForDrain(dc);

      const ok = this.peer.send(buf);
      if (!ok) throw new Error('Koneksi terputus');

      offset = end;
      this.ui.updateProgress(id, offset, file.size);
    }

    this.peer.send({ type: 'file-end', id });
    this.ui.completeTransfer(id, 'send');
    this.currentSendId = null;
  }

  _waitForDrain(dc) {
    const HIGH = CONFIG.BUFFER_HIGH;
    const LOW = CONFIG.BUFFER_LOW;
    if (dc.bufferedAmount < HIGH) return Promise.resolve();

    return new Promise(resolve => {
      const check = () => {
        if (dc.bufferedAmount <= LOW) {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        dc.removeEventListener('bufferedamountlow', check);
        clearInterval(poll);
      };
      dc.bufferedAmountLowThreshold = LOW;
      dc.addEventListener('bufferedamountlow', check);
      const poll = setInterval(check, 100);
    });
  }

  _handleData(data) {
    const isControl =
      typeof data === 'object' &&
      data !== null &&
      !(data instanceof ArrayBuffer) &&
      !(data instanceof Uint8Array);

    if (isControl) this._handleControl(data);
    else this._handleChunk(data);
  }

  _handleControl(msg) {
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
      if (this.receiving && this.receiving.id === msg.id) {
        const r = this.receiving;
        const blob = new Blob(r.chunks, { type: r.mime });
        const url = URL.createObjectURL(blob);

        this.ui.completeTransfer(r.id, 'receive', () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = r.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
        });

        this.receiving = null;
      }
    }
  }

  _handleChunk(data) {
    if (!this.receiving) return;

    let buf = null;
    if (data instanceof ArrayBuffer) buf = data;
    else if (data instanceof Uint8Array) buf = data.buffer;
    else if (data && data.buffer instanceof ArrayBuffer) buf = data.buffer;
    else return;

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
    this.currentSendId = null;
  }

  reset() {
    this.queue = [];
    this.processing = false;
    this.receiving = null;
    this.currentSendId = null;
  }

  _genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }
}