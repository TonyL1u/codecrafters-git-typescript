import { createBlobObject } from '../create';
import { writeGitObjects, print } from '../shared';

const args = process.argv.slice(2);

export function HashObject() {
	const [_, __, file] = args;
	const { compressed, hash } = createBlobObject(file);
	// write compressed content to .git/objects
	writeGitObjects(compressed, hash);
	print(hash);
}
