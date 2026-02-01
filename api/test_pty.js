try {
    const pty = require('node-pty');
    console.log('node-pty loaded successfully');
    const ptyProcess = pty.spawn('/bin/sh', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env
    });
    console.log('PTY spawned, pid:', ptyProcess.pid);
    ptyProcess.kill();
    process.exit(0);
} catch (e) {
    console.error('PTY test failed:', e.message);
    process.exit(1);
}
