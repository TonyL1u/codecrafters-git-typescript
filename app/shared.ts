import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

export function print(str: string) {
	return process.stdout.write(str, 'utf-8');
}

export function readGitObjects(hash: string) {
	const dir = hash.slice(0, 2);
	const blob = hash.slice(2);
	const buffer = fs.readFileSync(path.resolve('.git/objects', dir, blob));

	return zlib.unzipSync(new Uint8Array(buffer));
}

export function writeGitObjects(buffer: Buffer, hash: string) {
	const dir = hash.slice(0, 2);
	const blob = hash.slice(2);
	const dirPath = path.resolve('.git/objects', dir);
	const blobPath = path.resolve(dirPath, blob);

	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath);
	}

	if (!fs.existsSync(blobPath)) {
		fs.writeFileSync(blobPath, new Uint8Array(buffer));
	}
}

export function concatBuffer(...buffers: Buffer[]) {
	return Buffer.concat(buffers.map((buf) => new Uint8Array(buf)));
}
