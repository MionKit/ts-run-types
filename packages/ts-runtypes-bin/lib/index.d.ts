// Returns the absolute path to the ts-runtypes resolver binary for the host
// platform, resolving the matching `@ts-runtypes/binary-<os>-<arch>` optional
// dependency (or the locally built `bin/ts-runtypes` inside this repo).
// Throws when no compatible binary is installed.
export declare function getExePath(): string;
