
const mongoose = require("mongoose");
const Repository = require("../models/repoModel");
const User = require("../models/userModel");

// Create repository
async function createRepository(req, res) {
    const { name, issues, content, description, visibility } = req.body;
    const owner = req.user.id;

    try {
        if (!name || !name.trim()) {
            return res.status(400).json({
                error: "Repository name is required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(owner)) {
            return res.status(400).json({
                error: "Invalid User ID"
            });
        }

        const existingOwner = await User.findById(owner);

        if (!existingOwner) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        const existingRepository = await Repository.findOne({
            name: name.trim(),
            owner
        });

        if (existingRepository) {
            return res.status(409).json({
                error: "Repository with this name already exists"
            });
        }

        const newRepository = new Repository({
            name: name.trim(),
            description,
            visibility: visibility ?? true,
            owner,
            content: content ?? [],
            issues: issues ?? []
        });

        const result = await newRepository.save();

        await User.findByIdAndUpdate(owner, {
            $addToSet: { repositories: result._id }
        });

        return res.status(201).json({
            message: "Repository created successfully",
            repositoryID: result._id
        });

    } catch (err) {
        console.error("Repository creation error:", err.message);

        return res.status(err.code === 11000 ? 409 : 500).json({
            error: err.code === 11000
                ? "Repository already exists"
                : "Server error"
        });
    }
}

// Get all public repositories
async function getAllRepositories(req, res) {
    try {
        const repositories = await Repository.find({
            visibility: true
        })
            .populate("owner", "-password")
            .populate("issues");

        return res.json(repositories);

    } catch (err) {
        console.error("Fetch repositories error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Fetch repository by ID
async function fetchRepositoryById(req, res) {
    const { id } = req.params;

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid repository ID"
            });
        }

        const repository = await Repository.findById(id)
            .populate("owner", "-password")
            .populate("issues");

        if (!repository) {
            return res.status(404).json({
                error: "Repository not found"
            });
        }

        if (
            !repository.visibility &&
            (!repository.owner ||
            repository.owner._id.toString() !== req.user.id)
        ) {
            return res.status(403).json({
                error: "You cannot access this private repository"
            });
        }

        return res.json(repository);

    } catch (err) {
        console.error("Fetch repository error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Fetch repository by name
async function fetchRepositoryByName(req, res) {
    const { name } = req.params;

    try {
        const repositories = await Repository.find({
            name,
            visibility: true
        })
            .populate("owner", "-password")
            .populate("issues");

        if (repositories.length === 0) {
            return res.status(404).json({
                error: "Repository not found"
            });
        }

        return res.json(repositories);

    } catch (err) {
        console.error("Fetch repository error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Fetch repositories belonging to the logged-in user
async function fetchRepositoriesForCurrentUser(req, res) {
    const { userID } = req.params;

    try {
        if (!mongoose.Types.ObjectId.isValid(userID)) {
            return res.status(400).json({
                error: "Invalid User ID"
            });
        }

        if (req.user.id !== userID) {
            return res.status(403).json({
                error: "You can only view your own repositories"
            });
        }

        const repositories = await Repository.find({
            owner: userID
        })
            .populate("owner", "-password")
            .populate("issues");

        return res.json({
            message: "Repositories fetched successfully",
            repositories
        });

    } catch (err) {
        console.error("Fetch user repositories error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Update repository
async function updateRepositoryById(req, res) {
    const { id } = req.params;
    const { content, description } = req.body;

    try {
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
                error: "You can only update your own repositories"
            });
        }

        if (content !== undefined) {
            repository.content.push(content);
        }

        if (description !== undefined) {
            repository.description = description;
        }

        const updatedRepository = await repository.save();

        return res.json({
            message: "Repository updated successfully",
            repository: updatedRepository
        });

    } catch (err) {
        console.error("Update repository error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Toggle repository visibility
async function toggleVisibilityById(req, res) {
    const { id } = req.params;

    try {
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
                error: "You can only change your own repository visibility"
            });
        }

        repository.visibility = !repository.visibility;

        const updatedRepository = await repository.save();

        return res.json({
            message: "Repository visibility updated successfully",
            repository: updatedRepository
        });

    } catch (err) {
        console.error("Toggle visibility error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Delete repository
async function deleteRepositoryById(req, res) {
    const { id } = req.params;

    try {
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
                error: "You can only delete your own repositories"
            });
        }

        await Repository.findByIdAndDelete(id);

        await User.findByIdAndUpdate(repository.owner, {
            $pull: {
                repositories: repository._id,
                starRepos: repository._id
            }
        });

        return res.json({
            message: "Repository deleted successfully"
        });

    } catch (err) {
        console.error("Delete repository error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

module.exports = {
    createRepository,
    getAllRepositories,
    fetchRepositoryById,
    fetchRepositoryByName,
    fetchRepositoriesForCurrentUser,
    updateRepositoryById,
    toggleVisibilityById,
    deleteRepositoryById
};
