/**
 * The name of the Python interpreter each platform ships — `python` on
 * Windows, `python3` everywhere else (a Linux server often has no `python`).
 *
 * Its own module, with no imports: readers that only need the NAME (the
 * delivery gate, the CLI scaffold, discovery) must not load the execution
 * kernel to learn it. python-runtime, which RUNS Python, re-exports it.
 */
export function pythonExecutable(): string {
    return process.platform === 'win32' ? 'python' : 'python3';
}
