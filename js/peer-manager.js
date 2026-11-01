import { CONFIG } from './config.js';

export class PeerManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this._handlers = {};
  }

  on(event, cb) {
    (this._handlers[event] = this._handlers[event] || []).push(cb);
  }

  _emit(event, ...args) {
    (this._handlers[event] || []).forEach(cb => {
      try { cb(...args); } catch (e) { console.error(e); }
    });
  }

  host(code) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(CONFIG.PEER_PREFIX + code, { debug: 0 });
      let resolved = false;

      this.peer.on('open', () => {
        this._wirePeer();
        if (!resolved) { resolved = true; resolve(code); }
      });

      this.peer.on('error', err => {
        if (!resolved) { resolved = true; reject(err); }
        else this._emit('error', err);
      });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer({ debug: 0 });
      let resolved = false;

      this.peer.on('open', () => {
        this._wirePeer();
        const conn = this.peer.connect(CONFIG.PEER_PREFIX + code, {
          serialization: 'binary',
          reliable: true,
        });
        this._setupConn(conn);

        conn.on('open', () => {
          if (!resolved) { resolved = true; resolve(); }
        });
        conn.on('error', err => {
          if (!resolved) { resolved = true; reject(err); }
        });
      });

      this.peer.on('error', err => {
        if (!resolved) { resolved = true; reject(err); }
        else this._emit('error', err);
      });
    });
  }

  _wirePeer() {
    this.peer.on('connection', conn => {
      if (this.conn) {
        try { conn.close(); } catch (e) {}
        return;
      }
      this._setupConn(conn);
    });
    this.peer.on('error', err => this._emit('error', err));
    this.peer.on('close', () => this._emit('peer-close'));
    this.peer.on('disconnected', () => this._emit('peer-disconnected'));
  }

  _setupConn(conn) {
    this.conn = conn;
    let opened = false;

    const onOpen = () => {
      if (opened) return;
      opened = true;
      this._emit('open');
    };

    conn.on('open', onOpen);
    conn.on('data', data => this._emit('data', data));
    conn.on('close', () => this._emit('close'));
    conn.on('error', err => this._emit('error', err));

    if (conn.open) onOpen();
  }

  send(data) {
    if (!this.conn || !this.conn.open) return false;
    try {
      this.conn.send(data);
      return true;
    } catch (e) {
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
    if (this.conn) {
      try { this.conn.close(); } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    this._handlers = {};
  }
}