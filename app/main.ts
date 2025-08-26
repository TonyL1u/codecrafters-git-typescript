import {
	CatFile,
	CommitTree,
	HashObject,
	Init,
	LsTree,
	WriteTree
} from './commands';

const args = process.argv.slice(2);
const command = args[0];

enum GitCommand {
	INIT = 'init',
	CAT_FILE = 'cat-file',
	HASH_OBJECT = 'hash-object',
	LS_TREE = 'ls-tree',
	WRITE_TREE = 'write-tree',
	COMMIT_TREE = 'commit-tree'
}

switch (command) {
	case GitCommand.INIT:
		Init();
		break;
	case GitCommand.CAT_FILE:
		CatFile();
		break;
	case GitCommand.HASH_OBJECT:
		HashObject();
		break;
	case GitCommand.LS_TREE:
		LsTree();
		break;
	case GitCommand.WRITE_TREE:
		WriteTree();
		break;
	case GitCommand.COMMIT_TREE:
		CommitTree();
		break;
	default:
		throw new Error(`Unknown command ${command}`);
}
