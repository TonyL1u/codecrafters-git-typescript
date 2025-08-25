import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
	case 'init':
		// You can use print statements as follows for debugging, they'll be visible when running tests.
		console.error('Logs from your program will appear here!');

		// Uncomment this block to pass the first stage
		fs.mkdirSync('.git', { recursive: true });
		fs.mkdirSync('.git/objects', { recursive: true });
		fs.mkdirSync('.git/refs', { recursive: true });
		fs.writeFileSync('.git/HEAD', 'ref: refs/heads/main\n');
		console.log('Initialized git directory');
		break;
	case 'cat-file':
		const [_, __, hash] = args;
		const dirName = hash.slice(0, 2);
		const blobName = hash.slice(2);
		const buffer = fs.readFileSync(
			path.resolve('.git/objects', dirName, blobName)
		);
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
	default:
		throw new Error(`Unknown command ${command}`);
}
