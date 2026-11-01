import { CONFIG } from './config.js';

export class PeerManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this._handlers = {};
    this._destroyed = false;
  }

  on(event, cb) {
    (this._handlers[event] = this._handlers[event] || []).push(cb);
  }

  _emit(event, ...args) {
    (this._handlers[event] || []).forEach(cb => {
      try { cb(...args); } catch (e) { console.error('[PeerManager handler]', event, e); }
    });
  }

  _log(...a) { if (CONFIG.DEBUG) console.log('[Peer]', ...a); }

  host(code) {
    return new Promise((resolve, reject) => {
      try { this.peer = new Peer(CONFIG.PEER_PREFIX + code, { debug: 1 }); }
      catch (e) { return reject(e); }

      let resolved = false;
      const fail = err => {
        if (resolved) return;
        resolved = true;
        try { this.peer.destroy(); } catch (_) {}
        reject(err);
      };

      this.peer.on('open', id => {
        this._log('host open, id=', id);
        this._wirePeer();
        if (!resolved) { resolved = true; resolve(code); }
      });

      this.peer.on('error', err => {
        this._log('host error', err && err.type);
        if (!resolved) fail(err);
        else this._emit('error', err);
      });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      try { this.peer = new Peer({ debug: 1 }); }
      catch (e) { return reject(e); }

      let resolved = false;
      let timer = null;

      const fail = err => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { this.peer.destroy(); } catch (_) {}
        reject(err);
      };

      this.peer.on('open', () => {
        this._log('guest peer open, connecting to', CONFIG.PEER_PREFIX + code);
        this._wirePeer();

        const conn = this.peer.connect(CONFIG.PEER_PREFIX + code, {
          reliable: true,
        });
        this._setupConn(conn);

        conn.on('open', () => {
          this._log('guest conn open');
          if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
        });
        conn.on('error', err => {
          this._log('guest conn error', err);
          if (!resolved) fail(err);
        });

        timer = setTimeout(() => {
          if (!resolved) fail(new Error('timeout'));
        }, CONFIG.CONN_TIMEOUT_MS);
      });

      this.peer.on('error', err => {
        this._log('guest peer error', err && err.type);
        if (!resolved) fail(err);
        else this._emit('error', err);
      });
    });
  }

  _wirePeer() {
    this.peer.on('connection', conn => {
      this._log('incoming connection');
      if (this.conn) {
        try { conn.close(); } catch (e) {}
        return;
      }
      this._setupConn(conn);
    });
    this.peer.on('close', () => {
      this._log('peer close');
      this._emit('peer-close');
    });
    this.peer.on('disconnected', () => {
      this._log('peer disconnected');
      this._emit('peer-disconnected');
    });
  }

  _setupConn(conn) {
    this.conn = conn;
    let opened = false;

    const onOpen = () => {
      if (opened) return;
      opened = true;
      this._log('conn open fired');
      this._emit('open');
    };

    conn.on('open', onOpen);
    conn.on('data', data => {
      try { this._emit('data', data); }
      catch (e) { console.error('[Peer] data handler error', e); }
    });
    conn.on('close', () => {
      this._log('conn close');
      this._emit('close');
    });
    conn.on('error', err => {
      this._log('conn error', err);
      this._emit('error', err);
    });

    if (conn.open) onOpen();
  }

  send(data) {
    if (!this.conn || !this.conn.open) return false;
    try {
      this.conn.send(data);
      return true;
    } catch (e) {
      console.error('[Peer] send error', e);
      this._emit('error', e);
      return false;
    }
  }

  get dataChannel() {
    return this.conn ? this.conn.dataChannel : null;
  }

  isOpen() {
    return !!(this.conn && this.conn.open);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this._handlers = {};
  }
}