
const fs = require("fs").promises;
const path = require("path");
const { S3_BUCKET } = require("../config/aws-config");

async function initRepo() {
    const repoPath = path.resolve(process.cwd(), ".myGit");
    const commitsPath = path.join(repoPath, "commits");

    try {
        await fs.mkdir(commitsPath, { recursive: true });

        await fs.writeFile(
            path.join(repoPath, "config.json"),
            JSON.stringify({ bucket: S3_BUCKET }, null, 2)
        );

        console.log("Repository initialized!");
    } catch (err) {
        console.error("Error initializing repository:", err);
    }
}

module.exports = { initRepo };
