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
	LS_TREE = 'ls-tree',
	WRITE_TREE = 'write-tree'
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

interface TreeObjectEntry {
	mode: UnixFileMode;
	name: string;
	hash: string;
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
		const buf = readGitObjects(hash);
		print(buf.toString('utf-8', buf.indexOf(0x00) + 1));
		break;
	}
	case GitCommand.HASH_OBJECT: {
		const [_, __, file] = args;
		const { compressed, hash } = createBlobObject(file);
		// write compressed content to .git/objects
		writeGitObjects(compressed, hash);
		print(hash);
		break;
	}
	case GitCommand.LS_TREE: {
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

			// 3. search SHA-1 hash (20 bytes)
			const hashStart = nameEnd + 1;
			const hashEnd = hashStart + 20;
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
				print(`${mode} ${objectType} ${hash} ${name}\n`);
			}

			offset = hashEnd;
		}
		break;
	}
	case GitCommand.WRITE_TREE: {
		const iterate = (entry = '.') => {
			const entries: TreeObjectEntry[] = [];

			traverseDirs(entry, (file, isDirectory) => {
				if (isDirectory && file.startsWith('.git')) return;

				if (isDirectory) {
					const { hash } = iterate(file);
					entries.push({
						mode: UnixFileMode.DIR,
						name: path.basename(file),
						hash
					});
				} else {
					const { compressed, hash } = createBlobObject(file);
					// write compressed content to .git/objects
					writeGitObjects(compressed, hash);
					entries.push({
						mode: UnixFileMode.REGULAR_FILE,
						name: path.basename(file),
						hash
					});
				}
			});
			// sort the entries alphabetically
			const sortedEntries = entries.toSorted((a, b) =>
				a.name.localeCompare(b.name)
			);
			const { compressed, hash } = createTreeObject(sortedEntries);
			// write compressed content to .git/objects
			writeGitObjects(compressed, hash);

			return { hash };
		};

		const { hash } = iterate();
		print(hash);

		break;
	}

	default:
		throw new Error(`Unknown command ${command}`);
}

function print(str: string) {
	return process.stdout.write(str, 'utf-8');
}

function readGitObjects(hash: string) {
	const dir = hash.slice(0, 2);
	const blob = hash.slice(2);
	const buffer = readUnit8ArrayFileSync(
		path.resolve('.git/objects', dir, blob)
	);

	return zlib.unzipSync(buffer);
}

function writeGitObjects(content: Uint8Array, hash: string) {
	const dir = hash.slice(0, 2);
	const blob = hash.slice(2);
	const dirPath = path.resolve('.git/objects', dir);
	const blobPath = path.resolve(dirPath, blob);

	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath);
	}

	if (!fs.existsSync(blobPath)) {
		fs.writeFileSync(blobPath, content);
	}
}

function createBlobObject(file: string) {
	// 1. pack content with "blob <size>\0"
	const raw = readUnit8ArrayFileSync(file);
	const header = Buffer.from(`blob ${raw.length}\0`);
	const buffer = Buffer.concat([new Uint8Array(header.buffer), raw]);
	const packed = new Uint8Array(buffer.buffer);

	// 2. use zlib to compress the packed content
	const compressed = new Uint8Array(zlib.deflateSync(packed));

	// 3. use crypto to calculate SHA-1 hash
	const shasum = crypto.createHash('sha1');
	const hash = shasum.update(packed).digest('hex');

	return { packed, compressed, hash };
}

function createTreeObject(entries: TreeObjectEntry[]) {
	// 1. generate tree parts
	const parts = entries.map(({ mode, name, hash }) => {
		const foreBuffer = new Uint8Array(Buffer.from(`${mode} ${name}\0`));
		const hashBuffer = stringHexToBinary(hash);

		return new Uint8Array(Buffer.concat([foreBuffer, hashBuffer]));
	});

	// 2. calculate tree size
	const size = parts.map((part) => part.length).reduce((a, b) => a + b);
	const header = Buffer.from(`tree ${size}\0`);

	// 3. pack the entire tree
	const buffer = Buffer.concat([new Uint8Array(header.buffer), ...parts]);
	const packed = new Uint8Array(buffer.buffer);

	// 4. use zlib to compress the packed content
	const compressed = new Uint8Array(zlib.deflateSync(packed));

	// 5. use crypto to calculate SHA-1 hash
	const shasum = crypto.createHash('sha1');
	const hash = shasum.update(packed).digest('hex');

	return { packed, compressed, hash };
}

function readUnit8ArrayFileSync(file: string) {
	const buffer = fs.readFileSync(file);

	return new Uint8Array(buffer.buffer);
}

function stringHexToBinary(hex: string) {
	const buffer = new ArrayBuffer(20);
	const view = new DataView(buffer);

	for (let i = 0; i < 20; i++) {
		view.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
	}

	return new Uint8Array(buffer);
}

function traverseDirs(
	entry: string,
	cb?: (entry: string, isDirectory: boolean) => void
) {
	const dirs = fs.readdirSync(entry);

	for (const dir of dirs) {
		const fullPath = path.join(entry, dir);
		const stat = fs.statSync(fullPath);
		const isDirectory = stat.isDirectory();
		cb?.(fullPath, isDirectory);
	}
}
