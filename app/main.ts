import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';

const args = process.argv.slice(2);
const command = args[0];

enum GitCommand {
	INIT = 'init',
	CAT_FILE = 'cat-file',
	HASH_OBJECT = 'hash-object',
	LS_TREE = 'ls-tree'
}

enum GitObjectType {
	BLOB = 'blob',
	TREE = 'tree'
}

enum UnixFileMode {
	REGULAR_FILE = 100644,
	EXECUTABLE_FILE = 100755,
	SYMBOLIC_LINK = 120000,
	DIR = 40000
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
		const str = readGitObjects(hash).toString();
		print(str.split('\0')[1]);
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

		print(hash);
		break;
	}
	case GitCommand.LS_TREE:
		const [_, flag, hash] = args;
		const buf = readGitObjects(hash);
		let offset = 0;
		while (offset < buf.length) {
			// 1. search mode type --> 0x20
			const modeStart = offset;
			const modeEnd = buf.indexOf(0x20, modeStart);
			const mode = buf.toString('utf-8', modeStart, modeEnd);

			// 2. search file/dir name --> 0x00
			const nameStart = modeEnd + 1;
			const nameEnd = buf.indexOf(0x00, modeEnd);
			const name = buf.toString('utf-8', nameStart, nameEnd);

			// 3. search SHA-1 hash
			const hashStart = nameEnd + 1;
			const hashEnd = hashStart + 21;
			const hash = buf.toString('hex', hashStart, hashEnd);

			if (mode === 'tree') {
				offset = hashStart;
				continue;
			}

			if (flag === '--name-only') {
				print(`${name}\n`);
			} else {
				const objectType =
					+mode === UnixFileMode.DIR
						? GitObjectType.TREE
						: GitObjectType.BLOB;
				print(`${mode} ${objectType} ${hash} ${name}`);
			}

			offset = hashEnd;
		}

		break;
	default:
		throw new Error(`Unknown command ${command}`);
}

function readGitObjects(hash: string) {
	const dir = hash.slice(0, 2);
	const blob = hash.slice(2);
	const buffer = fs.readFileSync(path.resolve('.git/objects', dir, blob));

	// @ts-ignore
	return zlib.unzipSync(buffer);
}

function print(str: string) {
	return process.stdout.write(str, 'utf-8');
}
