
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const Repository = require("../models/repoModel");
const { s3, S3_BUCKET } = require("../config/aws-config");

// Prevent simultaneous commit/restore operations in this backend process
const activeOperations = new Set();

// Get all S3 objects, including objects beyond the first 1000
async function listAllObjects(prefix) {
    let objects = [];
    let continuationToken;

    do {
        const data = await s3.listObjectsV2({
            Bucket: S3_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken
        }).promise();

        objects = objects.concat(data.Contents || []);

        continuationToken = data.IsTruncated
            ? data.NextContinuationToken
            : undefined;

    } while (continuationToken);

    return objects;
}

// Delete S3 objects in batches and check individual failures
async function deleteObjects(keys) {
    for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);

        if (batch.length === 0) continue;

        const result = await s3.deleteObjects({
            Bucket: S3_BUCKET,
            Delete: {
                Objects: batch.map(key => ({ Key: key })),
                Quiet: true
            }
        }).promise();

        if (result.Errors && result.Errors.length > 0) {
            console.error("S3 deletion errors:", result.Errors);
            throw new Error("Some S3 objects could not be deleted");
        }
    }
}

// Copy an S3 object
async function copyObject(sourceKey, destinationKey) {
    const copySource =
        `${S3_BUCKET}/${sourceKey
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`;

    await s3.copyObject({
        Bucket: S3_BUCKET,
        CopySource: copySource,
        Key: destinationKey
    }).promise();
}

// Best-effort cleanup: cleanup failures should not undo a completed restore
async function cleanupPrefix(prefix) {
    try {
        const objects = await listAllObjects(prefix);
        await deleteObjects(objects.map(file => file.Key));
    } catch (err) {
        console.error(`Cleanup failed for ${prefix}:`, err);
    }
}

// Save a full repository snapshot as a commit
async function saveSnapshotCommit(repositoryId, message) {
    const filesPrefix = `repositories/${repositoryId}/files/`;

    const files = (await listAllObjects(filesPrefix))
        .filter(file => file.Key !== filesPrefix);

    const commitID = randomUUID();
    const commitPrefix =
        `repositories/${repositoryId}/commits/${commitID}/`;

    for (const file of files) {
        const source = await s3.getObject({
            Bucket: S3_BUCKET,
            Key: file.Key
        }).promise();

        const relativeName = file.Key.substring(filesPrefix.length);

        await s3.putObject({
            Bucket: S3_BUCKET,
            Key: `${commitPrefix}${relativeName}`,
            Body: source.Body,
            ContentType: source.ContentType || "application/octet-stream"
        }).promise();
    }

    const commit = {
        commitID,
        message,
        date: new Date().toISOString(),
        fileCount: files.length
    };

    await s3.putObject({
        Bucket: S3_BUCKET,
        Key: `${commitPrefix}commit.json`,
        Body: JSON.stringify(commit, null, 2),
        ContentType: "application/json"
    }).promise();

    return commit;
}

// Check repository ownership
async function getOwnedRepository(id, userId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }

    return Repository.findOne({
        _id: id,
        owner: userId
    });
}

// Create a commit
async function createCommit(req, res) {
    const { id } = req.params;
    const { message } = req.body;

    if (activeOperations.has(id)) {
        return res.status(409).json({
            error: "Another commit or restore operation is in progress"
        });
    }

    try {
        const repository = await getOwnedRepository(id, req.user.id);

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found or access denied"
            });
        }

        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Commit message is required"
            });
        }

        activeOperations.add(id);

        const filesPrefix = `repositories/${id}/files/`;
        const files = (await listAllObjects(filesPrefix))
            .filter(file => file.Key !== filesPrefix);

        if (files.length === 0) {
            return res.status(400).json({
                error: "Upload files before creating a commit"
            });
        }

        const commit = await saveSnapshotCommit(id, message.trim());

        return res.status(201).json({
            message: "Commit created successfully",
            commit
        });

    } catch (err) {
        console.error("Create commit error:", err);

        return res.status(500).json({
            error: "Unable to create commit"
        });
    } finally {
        activeOperations.delete(id);
    }
}

// Get commit history
async function getCommitHistory(req, res) {
    const { id } = req.params;

    try {
        const repository = await getOwnedRepository(id, req.user.id);

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found or access denied"
            });
        }

        const prefix = `repositories/${id}/commits/`;
        const objects = await listAllObjects(prefix);

        const metadataFiles = objects.filter(
            file => file.Key.endsWith("/commit.json")
        );

        const commits = [];

        for (const file of metadataFiles) {
            const result = await s3.getObject({
                Bucket: S3_BUCKET,
                Key: file.Key
            }).promise();

            commits.push(JSON.parse(result.Body.toString("utf-8")));
        }

        commits.sort(
            (a, b) => new Date(b.date) - new Date(a.date)
        );

        return res.json({ commits });

    } catch (err) {
        console.error("Commit history error:", err);

        return res.status(500).json({
            error: "Unable to fetch commit history"
        });
    }
}

// Restore a previous commit
async function restoreCommit(req, res) {
    const { id } = req.params;
    const { commitID } = req.body;

    let backupPrefix;
    let temporaryPrefix;
    let currentPrefix;
    let backupCreated = false;
    let restoreCompleted = false;

    if (activeOperations.has(id)) {
        return res.status(409).json({
            error: "Another commit or restore operation is in progress"
        });
    }

    try {
        const repository = await getOwnedRepository(id, req.user.id);

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found or access denied"
            });
        }

        // Commit IDs are generated as UUID version 4
        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (typeof commitID !== "string" || !uuidPattern.test(commitID)) {
            return res.status(400).json({
                error: "Invalid commit ID"
            });
        }

        activeOperations.add(id);

        const commitPrefix =
            `repositories/${id}/commits/${commitID}/`;

        // Verify that the selected commit exists
        const metadata = await s3.getObject({
            Bucket: S3_BUCKET,
            Key: `${commitPrefix}commit.json`
        }).promise();

        const selectedCommit = JSON.parse(
            metadata.Body.toString("utf-8")
        );

        if (selectedCommit.commitID !== commitID) {
            return res.status(400).json({
                error: "Commit metadata does not match"
            });
        }

        // Get the files belonging to the selected snapshot
        const snapshotFiles = (await listAllObjects(commitPrefix))
            .filter(file => file.Key !== `${commitPrefix}commit.json`);

        if (snapshotFiles.length !== selectedCommit.fileCount) {
            return res.status(500).json({
                error: "Commit snapshot is incomplete"
            });
        }

        const restoreID = randomUUID();

        currentPrefix = `repositories/${id}/files/`;
        temporaryPrefix =
            `repositories/${id}/restore-temp/${restoreID}/`;
        backupPrefix =
            `repositories/${id}/restore-backup/${restoreID}/`;

        // Stage the selected snapshot in a temporary S3 location
        for (const file of snapshotFiles) {
            const relativeName = file.Key.substring(commitPrefix.length);

            await copyObject(
                file.Key,
                `${temporaryPrefix}${relativeName}`
            );
        }

        // Back up current repository files
        const currentFiles = (await listAllObjects(currentPrefix))
            .filter(file => file.Key !== currentPrefix);

        for (const file of currentFiles) {
            const relativeName = file.Key.substring(currentPrefix.length);

            await copyObject(
                file.Key,
                `${backupPrefix}${relativeName}`
            );
        }

        backupCreated = true;

        // Remove current repository files
        await deleteObjects(currentFiles.map(file => file.Key));

        // Copy the selected snapshot into the repository
        for (const file of snapshotFiles) {
            const relativeName = file.Key.substring(commitPrefix.length);

            await copyObject(
                `${temporaryPrefix}${relativeName}`,
                `${currentPrefix}${relativeName}`
            );
        }

        // Create a new commit recording the restoration
        const restoreCommit = await saveSnapshotCommit(
            id,
            `Restored to commit ${commitID}`
        );

        // The restoration is now committed
        restoreCompleted = true;

        // Temporary and backup cleanup must not undo a successful restore
        await cleanupPrefix(temporaryPrefix);
        await cleanupPrefix(backupPrefix);

        return res.json({
            message: "Commit restored successfully",
            restoredCommit: selectedCommit,
            newCommit: restoreCommit
        });

    } catch (err) {
        console.error("Restore commit error:", err);

        // Roll back only if the restoration was not successfully committed
        if (backupCreated && !restoreCompleted && currentPrefix && backupPrefix) {
            try {
                const currentFiles = await listAllObjects(currentPrefix);

                await deleteObjects(
                    currentFiles.map(file => file.Key)
                );

                const backupFiles = await listAllObjects(backupPrefix);

                for (const file of backupFiles) {
                    const relativeName =
                        file.Key.substring(backupPrefix.length);

                    await copyObject(
                        file.Key,
                        `${currentPrefix}${relativeName}`
                    );
                }

                console.log("Repository files rolled back successfully.");

            } catch (rollbackError) {
                console.error("Restore rollback error:", rollbackError);
            }
        }

        return res.status(500).json({
            error: "Unable to restore commit. Check backend logs."
        });

    } finally {
        activeOperations.delete(id);

        // Remove leftover temporary data after success or failure
        if (temporaryPrefix) {
            await cleanupPrefix(temporaryPrefix);
        }

        if (backupPrefix && (!restoreCompleted || backupCreated)) {
            await cleanupPrefix(backupPrefix);
        }
    }
}

module.exports = {
    createCommit,
    getCommitHistory,
    restoreCommit
};
