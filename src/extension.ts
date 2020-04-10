import * as vscode from 'vscode';
import { Danmacom } from './danmacom';
import { OutputTerminal } from './terminal';
import { DComment, DThread, showThread } from './comment';

function promptConfigureBackend() {
	vscode.window.showInformationMessage(
		'Please configure danmaku backend',
		'Open Settings'
	).then(item => {
		if (item === 'Open Settings')
			vscode.commands.executeCommand(
				'workbench.action.openSettings',
				`danmacom.program`
			);
	}, err => {
		console.error(err)
	});
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
		const cmd =
			vscode.workspace
			.getConfiguration('danmacom')
			.get('program') as string;

		if (cmd === '') {
			promptConfigureBackend();
			return;
		}

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

		current = new Danmacom(cmd, outputTerminal, terminal);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('danmacom.start', startDanmacom),
		vscode.commands.registerCommand('danmacom.stop', stopDanmacom),

		vscode.commands.registerCommand(
			'danmacom.statusBar',
			() => current?.clickStatusBar()
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
