import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { StringDecoder } from 'string_decoder';

class TerminalManager extends EventEmitter {
  private sessions: Record<string, ChildProcess> = {};

  constructor() {
    super();
    // Cleanup on exit to prevent zombie processes
    const cleanup = () => {
      Object.keys(this.sessions).forEach(id => this.kill(id));
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(); });
    process.on('SIGTERM', () => { cleanup(); process.exit(); });
  }

  create(id: string, cwd: string = process.cwd()) {
    if (this.sessions[id]) return;

    // Use bash or zsh if available, fallback to sh
    const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
    
    // Using spawn. Note: without node-pty, this is not a true TTY.
    // Interactive commands (vim, top) won't work well.
    // But basic commands (ls, npm run, git) will stream output.
    const p = spawn(shell, ['-i'], {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.sessions[id] = p;

    const decoderOut = new StringDecoder('utf8');
    const decoderErr = new StringDecoder('utf8');

    p.stdout?.on('data', (data) => {
      this.emit('data', { id, data: decoderOut.write(data) });
    });

    p.stderr?.on('data', (data) => {
      this.emit('data', { id, data: decoderErr.write(data) });
    });

    p.on('exit', (code) => {
      this.emit('data', { id, data: `\r\n[Process exited with code ${code}]\r\n` });
      delete this.sessions[id];
    });

    // Initial prompt might not appear because spawn doesn't echo like a TTY
    // We can manually send a welcome message
    this.emit('data', { id, data: `\r\nConnected to ${shell}\r\n` });
  }

  write(id: string, data: string) {
    const p = this.sessions[id];
    if (p && p.stdin) {
      p.stdin.write(data);
    }
  }

  resize(id: string, cols: number, rows: number) {
    // Not supported without node-pty
  }

  kill(id: string) {
    const p = this.sessions[id];
    if (p) {
      p.kill();
      delete this.sessions[id];
    }
  }
}

export const terminalManager = new TerminalManager();
