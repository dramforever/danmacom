import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as readline from 'readline';
import { Backend, BackendConfigError } from '.';
import { TextDanmaku } from '../danmaku';

export class ProcessManager implements Backend {
    cmd: string;
    proc: child_process.ChildProcess;
    stdout: readline.ReadLine;
    running: boolean;
    disposables: vscode.Disposable[];

    onDanmaku: vscode.Event<TextDanmaku>;
    onLogMessage: vscode.Event<string>;
    onClose: vscode.Event<void>;

    constructor(config: object) {
        if ('cmd' in config && typeof (config as any).cmd === 'string') {
            this.cmd = (config as any).cmd;
            this.proc = child_process.spawn(
                this.cmd,
                { shell: true, stdio: 'pipe' }
            );
        } else {
            throw new BackendConfigError('Required: cmd: string');
        }

        const logEmitter = new vscode.EventEmitter<string>();
        this.onLogMessage = logEmitter.event;

        this.proc.stderr.on('data',
            data => logEmitter.fire(data.toString()));

        this.stdout = readline.createInterface({
            input: this.proc.stdout
        });

        const danmakuEmitter = new vscode.EventEmitter<TextDanmaku>();
        this.onDanmaku = danmakuEmitter.event;

        this.stdout.on('line', (line) => {
            try {
                danmakuEmitter.fire(JSON.parse(line) as TextDanmaku);
            } catch (err) {
                logEmitter.fire(err.toString());
            }
        });

        this.running = true;

        const closeEmitter = new vscode.EventEmitter<void>();
        this.onClose = closeEmitter.event;

        const stop = () => {
            closeEmitter.fire();
            this.dispose();
        }

        this.proc.on('exit', stop);
        this.proc.on('error', stop);

        this.disposables = [danmakuEmitter, closeEmitter];
    }

    toString() {
        return `External: ${this.cmd}`;
    }

    dispose() {
        if (this.running) {
            this.running = false;
            this.proc.kill();
            this.disposables.forEach(x => x.dispose());
        }
    }
}
