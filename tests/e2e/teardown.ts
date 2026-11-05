// Temp files are in the OS temporary directory and never replace the real closet.
// Let the OS temp policy clean them up; no recursive workspace deletion here.
export default async function teardown() {}
