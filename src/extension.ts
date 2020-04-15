import * as vscode from 'vscode';
import { Danmacom } from './danmacom';
import { OutputTerminal } from './terminal';
import { DComment, DThread, showThread } from './comment';
import { BackendMaker, BackendConfigError, Backend } from './backend';
import { BilibiliBackend } from './backend/bilibili';
import { ProcessManager } from './backend/process';

const backends: { [k: string]: BackendMaker } = {
	'bilibili': BilibiliBackend,
	'external': ProcessManager
}

export function activate(context: vscode.ExtensionContext) {
	const outputTerminal = new OutputTerminal();
	const terminal = vscode.window.createTerminal({
		name: 'Danmacom',
		pty: outputTerminal
	});
	context.subscriptions.push(outputTerminal, terminal);

	let current: Danmacom | null = null;

	function stopDanmacom() {
		if (current?.running) {
			current.dispose();
			current = null;
		}
	}

	function startDanmacom() {
		const config = vscode.workspace.getConfiguration('danmacom');
		if (! (config.backend in backends)) {
			const msg =
				config.backend === ''
				? 'Backend not configured'
				: `No such backend: ${config.backend}`;
			vscode.window.showErrorMessage(msg, 'Settings')
				.then(
					(item) => {
						if (item === 'Settings') {
							vscode.commands.executeCommand(
								'workbench.action.openSettings',
								`danmacom`
							);
						}
					},
					(err) => console.error(err)
				)
			return;
		}

		const backend: Backend | null = (() => {
			try {
				return new backends[config.backend](config.backendConfig)
			} catch(err) {
				if (err instanceof BackendConfigError) {
					vscode.window.showErrorMessage(
						`Backend config error: ${err}`,
						'Settings'
					).then(
						(item) => {
							if (item === 'Settings') {
								vscode.commands.executeCommand(
									'workbench.action.openSettings',
									`danmacom`
								);
							}
						},
						(err) => console.error(err)
					)
				} else {
					vscode.window.showErrorMessage(
						`Error: ${err}`
					);
				}
				return null;
			}
		})();

		if (backend === null) return;

		if (current?.running) {
			vscode.window.showInformationMessage(
				'Danmacom is already running',
				'Stop'
			).then(
				(item) => {
					if (item === 'Stop') {
						stopDanmacom();
					}
				},
				(err) => console.error(err)
			);
			return;
		}

		current = new Danmacom(outputTerminal, terminal, backend!);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('danmacom.start', startDanmacom),
		vscode.commands.registerCommand('danmacom.stop', stopDanmacom),

		vscode.commands.registerCommand(
			'danmacom.statusBar',
			() => current?.clickStatusBar()
		),
		vscode.commands.registerCommand(
			'danmacom.createThread',
			(reply) => current?.handleReply(reply)
		),
		vscode.commands.registerCommand(
			'danmacom.reply',
			(reply) => current?.handleReply(reply)
		),
		vscode.commands.registerCommand(
			'danmacom.deleteComment',
			(comment: DComment) => comment.dispose()
		),
		vscode.commands.registerCommand(
			'danmacom.deleteThread',
			(thread: DThread) => {
				thread.manager.removeThread(thread);
				thread.dispose();
			}
		),
		vscode.commands.registerCommand(
			'danmacom.showThread',
			showThread
		)
	);
}

export function deactivate() {}
