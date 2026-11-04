
const mongoose = require("mongoose");
const Repository = require("../models/repoModel");
const Issue = require("../models/issueModel");

// Create issue
async function createIssue(req, res) {
    const { title, description } = req.body;
    const { id } = req.params;

    try {
        if (!title || !description || !id) {
            return res.status(400).json({
                error: "Title, description and repository ID are required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid repository ID"
            });
        }

        const repository = await Repository.findById(id);

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found"
            });
        }

        if (repository.owner.toString() !== req.user.id) {
            return res.status(403).json({
                error: "You can only create issues in your own repositories"
            });
        }

        const issue = new Issue({
            title,
            description,
            repository: [repository._id]
        });

        await issue.save();

        repository.issues.push(issue._id);
        await repository.save();

        return res.status(201).json({
            message: "Issue created successfully",
            issue
        });

    } catch (err) {
        console.error("Issue creation error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Update issue
async function updateIssueById(req, res) {
    const { id } = req.params;
    const { title, description, status } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid issue ID"
            });
        }

        const issue = await Issue.findById(id);

        if (!issue) {
            return res.status(404).json({
                error: "Issue not found"
            });
        }

        const repository = await Repository.findOne({
            _id: { $in: issue.repository },
            owner: req.user.id
        });

        if (!repository) {
            return res.status(403).json({
                error: "You cannot modify this issue"
            });
        }

        if (title !== undefined) {
            issue.title = title;
        }

        if (description !== undefined) {
            issue.description = description;
        }

        if (status !== undefined) {
            if (!["open", "close"].includes(status)) {
                return res.status(400).json({
                    error: "Status must be open or close"
                });
            }

            issue.status = status;
        }

        await issue.save();

        return res.json({
            message: "Issue updated successfully",
            issue
        });

    } catch (err) {
        console.error("Issue update error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Delete issue
async function deleteIssueById(req, res) {
    const { id } = req.params;

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid issue ID"
            });
        }

        const issue = await Issue.findById(id);

        if (!issue) {
            return res.status(404).json({
                error: "Issue not found"
            });
        }

        const repository = await Repository.findOne({
            _id: { $in: issue.repository },
            owner: req.user.id
        });

        if (!repository) {
            return res.status(403).json({
                error: "You cannot delete this issue"
            });
        }

        await Issue.findByIdAndDelete(id);

        await Repository.updateMany(
            { issues: issue._id },
            { $pull: { issues: issue._id } }
        );

        return res.json({
            message: "Issue deleted successfully"
        });

    } catch (err) {
        console.error("Issue deletion error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Get all issues
async function getAllIssues(req, res) {
    try {
        const issues = await Issue.find({})
            .populate("repository");

        return res.status(200).json(issues);

    } catch (err) {
        console.error("Issue fetching error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Get issue by ID
async function getIssueById(req, res) {
    const { id } = req.params;

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid issue ID"
            });
        }

        const issue = await Issue.findById(id)
            .populate("repository");

        if (!issue) {
            return res.status(404).json({
                error: "Issue not found"
            });
        }

        return res.json(issue);

    } catch (err) {
        console.error("Issue fetching error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

module.exports = {
    createIssue,
    updateIssueById,
    deleteIssueById,
    getAllIssues,
    getIssueById
};
