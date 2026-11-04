
const fs = require("fs").promises;
const path = require("path");
const { s3, S3_BUCKET } = require("../config/aws-config");

async function pullRepo() {
    const repoPath = path.resolve(process.cwd(), ".myGit");
    const commitsPath = path.join(repoPath, "commits");

    try {
        await fs.mkdir(commitsPath, { recursive: true });

        let continuationToken;

        do {
            const data = await s3.listObjectsV2({
                Bucket: S3_BUCKET,
                Prefix: "commits/",
                ContinuationToken: continuationToken
            }).promise();

            for (const object of data.Contents || []) {
                const key = object.Key;

                const relativePath = key.substring("commits/".length);
                const destinationPath = path.join(commitsPath, relativePath);

                await fs.mkdir(path.dirname(destinationPath), {
                    recursive: true
                });

                const fileContent = await s3.getObject({
                    Bucket: S3_BUCKET,
                    Key: key
                }).promise();

                await fs.writeFile(destinationPath, fileContent.Body);
            }

            continuationToken = data.IsTruncated
                ? data.NextContinuationToken
                : undefined;

        } while (continuationToken);

        console.log("All commits pulled from S3.");

    } catch (err) {
        console.error("Unable to pull:", err.message);
    }
}

module.exports = { pullRepo };
