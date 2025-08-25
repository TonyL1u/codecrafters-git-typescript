import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';

const args = process.argv.slice(2);
const command = args[0];

enum GitCommand {
	INIT = 'init',
	CAT_FILE = 'cat-file',
	HASH_OBJECT = 'hash-object'
}

switch (command) {
	case GitCommand.INIT:
		// You can use print statements as follows for debugging, they'll be visible when running tests.
		console.error('Logs from your program will appear here!');

		// Uncomment this block to pass the first stage
		fs.mkdirSync('.git', { recursive: true });
		fs.mkdirSync('.git/objects', { recursive: true });
		fs.mkdirSync('.git/refs', { recursive: true });
		fs.writeFileSync('.git/HEAD', 'ref: refs/heads/main\n');
		console.log('Initialized git directory');
		break;
	case GitCommand.CAT_FILE: {
		const [_, __, hash] = args;
		const dir = hash.slice(0, 2);
		const blob = hash.slice(2);
		const buffer = fs.readFileSync(path.resolve('.git/objects', dir, blob));
		// @ts-ignore
		zlib.unzip(buffer, (err, buf) => {
			if (err) {
				console.error('An error occurred:', err);
				process.exitCode = 1;
			}
			const [_, content] = buf.toString().split('\0');

			process.stdout.write(content);
		});
		break;
	}
	case GitCommand.HASH_OBJECT: {
		const [_, __, file] = args;
		const rawContent = fs.readFileSync(file, 'utf-8');
		const packedContent = `blob ${rawContent.length}\0${rawContent}`; // blob <size>\0<content>

		// 1. use zlib to compress the packed content
		const compressedContent = zlib
			.deflateSync(packedContent)
			.toString('base64');

		// 2. use crypto to calculate SHA-1 hash
		const shasum = crypto.createHash('sha1');
		const hash = shasum.update(packedContent).digest('hex');

		// 3. write compressed content to .git/objects
		const dir = hash.slice(0, 2);
		const blob = hash.slice(2);
		fs.mkdirSync(path.resolve('.git/objects', dir));
		fs.writeFileSync(
			path.resolve('.git/objects', dir, blob),
			compressedContent,
			'base64'
		);

		process.stdout.write(hash);
		break;
	}
	default:
		throw new Error(`Unknown command ${command}`);
}
