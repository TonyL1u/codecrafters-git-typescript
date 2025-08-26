import * as fs from 'node:fs';

export function Init() {
	// You can use print statements as follows for debugging, they'll be visible when running tests.
	console.error('Logs from your program will appear here!');

	// Uncomment this block to pass the first stage
	fs.mkdirSync('.git', { recursive: true });
	fs.mkdirSync('.git/objects', { recursive: true });
	fs.mkdirSync('.git/refs', { recursive: true });
	fs.writeFileSync('.git/HEAD', 'ref: refs/heads/main\n');
	console.log('Initialized git directory');
}
