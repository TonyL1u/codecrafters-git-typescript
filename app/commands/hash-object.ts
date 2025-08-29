import { createBlobObject } from '../create';
import { GitObjectReader, print } from '../shared';

const args = process.argv.slice(2);

export function HashObject() {
	const [_, __, file] = args;
	const reader = new GitObjectReader();
	const { compressed, hash } = createBlobObject(file);
	// write compressed content to .git/objects
	reader.write(compressed, hash);
	print(hash);
}
