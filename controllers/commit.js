
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");

async function commitRepo(message) {
    const repoPath = path.resolve(process.cwd(), ".myGit");
    const stagedPath = path.join(repoPath, "staging");
    const commitPath = path.join(repoPath, "commits");

    console.log("Commit command called");

    try {
        if (!message || !message.trim()) {
            throw new Error("Commit message cannot be empty.");
        }

        const files = await fs.readdir(stagedPath);

        if (files.length === 0) {
            throw new Error("No files to commit. Add files first.");
        }

        const commitID = uuidv4();
        const commitDir = path.join(commitPath, commitID);

        await fs.mkdir(commitDir, { recursive: true });

        for (const file of files) {
            await fs.copyFile(
                path.join(stagedPath, file),
                path.join(commitDir, file)
            );
        }

        await fs.writeFile(
            path.join(commitDir, "commit.json"),
            JSON.stringify({
                message: message,
                date: new Date().toISOString()
            }, null, 2)
        );

        // Clear staging after successful commit
        await fs.rm(stagedPath, { recursive: true, force: true });

        console.log(`Commit ${commitID} created successfully!`);
    } catch (err) {
        console.error("Error committing files:", err.message);
    }
}

module.exports = { commitRepo };
