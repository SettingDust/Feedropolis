import Debug from 'debug';
import {exec} from 'child_process';

const debug = Debug('ap:db');

export function waitForDatabase(dbUri): Promise<void> {
	return new Promise(function(resolve, reject) {
		let cmd = `wait-on tcp:${dbUri.hostname}:${dbUri.port}`;
		debug(cmd);
		let p = exec(cmd, {}, (err) => {
			if (err) reject(err);
			else resolve();
		});
		setTimeout(() => {
			if (p.killed) return;
			p.kill();
			reject(new Error('timeout connecting to database'));
		},6000);
	});
}

export function runMigrations(dbUri): Promise<void> {
	return new Promise(function(resolve, reject) {
		let cmd = `knex --migrations-directory migrations --client pg --connection ${dbUri.href} migrate:latest`;
		debug(cmd);
		let p = exec(cmd, {}, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}
