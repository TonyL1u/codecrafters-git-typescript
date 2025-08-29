import { GitObjectReader, print } from '../shared';

const args = process.argv.slice(2);

export function CatFile() {
	const [_, __, hash] = args;
	const reader = new GitObjectReader();
	const { buffer } = reader.read(hash);
	print(buffer.toString());
}
