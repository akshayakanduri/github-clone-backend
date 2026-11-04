
const fs = require("fs").promises;
const path = require("path");

async function revertRepo(commitID) {
    const repoPath = path.resolve(process.cwd(), ".myGit");
    const commitsPath = path.join(repoPath, "commits");

    try {
        if (!commitID || commitID.includes("/") || commitID.includes("\\")) {
            throw new Error("Invalid commit ID.");
        }

        const commitDir = path.join(commitsPath, commitID);
        const files = await fs.readdir(commitDir);
        const parentDir = path.resolve(repoPath, "..");

        for (const file of files) {
            // Skip commit metadata
            if (file === "commit.json") {
                continue;
            }

            const sourcePath = path.join(commitDir, file);
            const destinationPath = path.join(parentDir, file);

            await fs.copyFile(sourcePath, destinationPath);
        }

        console.log(`Commit ${commitID} reverted successfully!`);
    } catch (err) {
        console.error("Unable to revert:", err.message);
    }
}

module.exports = { revertRepo };
