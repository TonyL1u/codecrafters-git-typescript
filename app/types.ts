export enum UnixFileMode {
	REGULAR_FILE = 100644,
	EXECUTABLE_FILE = 100755,
	SYMBOLIC_LINK = 120000,
	DIR = 40000
}

export enum GitObjectType {
	BLOB = 'blob',
	TREE = 'tree',
	COMMIT = 'commit'
}

export interface TreeObjectEntry {
	mode: UnixFileMode;
	name: string;
	hash: string;
}

export interface GitUser {
	name: string;
	email: string;
}

export interface CommitInfo {
	tree: string;
	parent: string;
	author: GitUser;
	committer: GitUser;
	time: string;
	message: string;
}
