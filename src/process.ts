import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as readline from 'readline';

export class ProcessManager {
    proc: child_process.ChildProcess;
    stdout: readline.ReadLine;
    running: boolean;
    disposables: vscode.Disposable[];

    onLine: vscode.Event<string>;
    onStderr: vscode.Event<string>;
    onStop: vscode.Event<void>;

    constructor(cmd: string) {
        this.proc = child_process.spawn(
            cmd,
            { shell: true, stdio: 'pipe' }
        );

        const stderrEmitter = new vscode.EventEmitter<string>();
        this.onStderr = stderrEmitter.event;

        this.proc.stderr.on('data',
            data => stderrEmitter.fire(data.toString()));

        this.stdout = readline.createInterface({
            input: this.proc.stdout
        });

        const lineEmitter = new vscode.EventEmitter<string>();
        this.onLine = lineEmitter.event;

        this.stdout.on('line', (line) => {
            lineEmitter.fire(line);
        });

        this.running = true;

        const stopEmitter = new vscode.EventEmitter<void>();
        this.onStop = stopEmitter.event;

        const stop = () => {
            stopEmitter.fire();
            this.dispose();
        }

        this.proc.on('exit', stop);
        this.proc.on('error', stop);

        this.disposables = [lineEmitter, stopEmitter];
    }

    dispose() {
        if (this.running) {
            this.running = false;
            this.proc.kill();
            this.disposables.forEach(x => x.dispose());
        }
    }
}
