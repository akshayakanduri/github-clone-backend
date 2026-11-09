
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

const Repository = require("../models/repoModel");
const { s3, S3_BUCKET } = require("../config/aws-config");
const { randomUUID } = require("crypto");

// Receive files in memory before uploading to S3
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10
    }
});

// Check repository ownership
async function getOwnedRepository(repositoryId, userId) {
    if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
        return null;
    }

    return Repository.findOne({
        _id: repositoryId,
        owner: userId
    });
}

// Get all S3 objects using pagination
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

// Validate and normalize a filename
function getSafeFileName(originalName) {
    if (typeof originalName !== "string" || !originalName.trim()) {
        return null;
    }

    const normalizedName = originalName.replace(/\\/g, "/");
    const fileName = path.posix.basename(normalizedName);

    if (
        !fileName ||
        fileName === "." ||
        fileName === ".." ||
        /[\x00-\x1F\x7F]/.test(fileName)
    ) {
        return null;
    }

    return fileName;
}

// Upload files and maintain previous versions
async function uploadFiles(req, res) {
    const { id } = req.params;

    try {
        const repository = await getOwnedRepository(id, req.user.id);

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found or access denied"
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: "Please select at least one file"
            });
        }

        const prefix = `repositories/${id}/files/`;
        const uploadedNames = req.files.map(file =>
            getSafeFileName(file.originalname)
        );

        if (uploadedNames.some(name => !name)) {
            return res.status(400).json({
                error: "One or more filenames are invalid"
            });
        }

        if (new Set(uploadedNames).size !== uploadedNames.length) {
            return res.status(409).json({
                error: "Duplicate filenames found in the selected files"
            });
        }

        const uploadedFiles = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const fileName = uploadedNames[i];
            const key = `${prefix}${fileName}`;

            // Check whether this file already exists
            let previousFile = null;

            try {
                previousFile = await s3.getObject({
                    Bucket: S3_BUCKET,
                    Key: key
                }).promise();
            } catch (err) {
                if (err.code !== "NoSuchKey" && err.statusCode !== 404) {
                    throw err;
                }
            }

            // Preserve the previous version before replacing it
            if (previousFile) {
                const versionID = randomUUID();

                const versionKey =
                    `repositories/${id}/file-versions/${fileName}/${versionID}`;

                await s3.putObject({
                    Bucket: S3_BUCKET,
                    Key: versionKey,
                    Body: previousFile.Body,
                    ContentType:
                        previousFile.ContentType ||
                        "application/octet-stream"
                }).promise();
            }

            // Upload the new file as the current version
            await s3.upload({
                Bucket: S3_BUCKET,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype || "application/octet-stream"
            }).promise();

            uploadedFiles.push({
                name: fileName,
                key,
                updated: Boolean(previousFile)
            });
        }

        return res.status(201).json({
            message: "Files uploaded successfully",
            files: uploadedFiles
        });

    } catch (err) {
        console.error("File upload error:", err);

        return res.status(500).json({
            error: "Unable to upload files"
        });
    }
}

// List files belonging to a repository
async function getRepositoryFiles(req, res) {
    const { id } = req.params;

    try {
        const repository = await getOwnedRepository(id, req.user.id);

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found or access denied"
            });
        }

        const prefix = `repositories/${id}/files/`;

        const objects = await listAllObjects(prefix);

        const files = objects
            .filter(file => file.Key !== prefix)
            .map(file => ({
                name: file.Key.substring(prefix.length),
                key: file.Key,
                size: file.Size,
                lastModified: file.LastModified
            }));

        return res.json({
            message: "Files fetched successfully",
            files
        });

    } catch (err) {
        console.error("Fetch files error:", err);

        return res.status(500).json({
            error: "Unable to fetch repository files"
        });
    }
}

// Download a file from a repository
async function downloadFile(req, res) {
    const { id } = req.params;
    const { name } = req.query;

    try {
        const repository = await getOwnedRepository(id, req.user.id);

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found or access denied"
            });
        }

        if (
            typeof name !== "string" ||
            !name.trim() ||
            name.includes("/") ||
            name.includes("\\") ||
            name === "." ||
            name === ".." ||
            /[\x00-\x1F\x7F]/.test(name)
        ) {
            return res.status(400).json({
                error: "Invalid file name"
            });
        }

        const key = `repositories/${id}/files/${name}`;

        const file = await s3.getObject({
            Bucket: S3_BUCKET,
            Key: key
        }).promise();

        res.setHeader(
            "Content-Type",
            file.ContentType || "application/octet-stream"
        );

        res.attachment(name);

        return res.send(file.Body);

    } catch (err) {
        console.error("File download error:", err);

        if (err.code === "NoSuchKey" || err.statusCode === 404) {
            return res.status(404).json({
                error: "File not found"
            });
        }

        return res.status(500).json({
            error: "Unable to download file"
        });
    }
}

module.exports = {
    upload,
    uploadFiles,
    getRepositoryFiles,
    downloadFile
};
