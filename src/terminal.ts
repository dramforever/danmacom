import * as vscode from 'vscode';

export class OutputTerminal implements vscode.Pseudoterminal {
    onDidWrite: vscode.Event<string>;
    writeEmitter: vscode.EventEmitter<string>;
    onClose: vscode.Event<void>;
    closeEmitter: vscode.EventEmitter<void>;
    onInput: vscode.Event<string>;
    inputEmitter: vscode.EventEmitter<string>;

    opened: boolean;
    buffer: string;

    constructor() {
        this.writeEmitter = new vscode.EventEmitter();
        this.onDidWrite = this.writeEmitter.event;

        this.closeEmitter = new vscode.EventEmitter();
        this.onClose = this.closeEmitter.event;

        this.inputEmitter = new vscode.EventEmitter();
        this.onInput = this.inputEmitter.event;

        this.opened = false;
        this.buffer = "";
    }

    write(data: string) {
        if (this.opened)
            this.writeEmitter.fire(data);
        else
            this.buffer += data;
    }

    close(): void {
        this.closeEmitter.fire();
        this.dispose();
    }

    open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.opened = true;
        if (this.buffer !== '') {
            this.write(this.buffer);
        }
    }

    handleInput(data: string) {
        this.inputEmitter.fire(data);
    }

    setDimensions(_dimensions: vscode.TerminalDimensions) {}

    dispose() {
        this.writeEmitter.dispose()
    }
}
