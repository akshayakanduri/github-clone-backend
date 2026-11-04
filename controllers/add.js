
const fs = require("fs").promises;
const path = require("path");

async function addRepo(filePath) {
    const repoPath = path.resolve(process.cwd(), ".myGit");
    const stagingPath = path.join(repoPath, "staging");

    try {
        const sourcePath = path.resolve(process.cwd(), filePath);
        const fileStat = await fs.stat(sourcePath);

        if (!fileStat.isFile()) {
            throw new Error("Please provide a file, not a directory.");
        }

        await fs.mkdir(stagingPath, { recursive: true });

        const fileName = path.basename(sourcePath);

        await fs.copyFile(
            sourcePath,
            path.join(stagingPath, fileName)
        );

        console.log(`File ${fileName} added to the staging area!`);
    } catch (err) {
        console.error("Error adding file:", err.message);
    }
}

module.exports = { addRepo };
