
const express = require("express");
const repoController = require("../controllers/repoController");
const authMiddleware = require("../middleware/authMiddleware");
const fileController = require("../controllers/fileController");
const commitController = require("../controllers/commitController");

const repoRouter = express.Router();

// Public routes
repoRouter.get("/repo/all", repoController.getAllRepositories);
repoRouter.get("/repo/:id", authMiddleware, repoController.fetchRepositoryById);
repoRouter.get("/repo/name/:name", repoController.fetchRepositoryByName);

// Protected routes
repoRouter.post("/repo/create", authMiddleware, repoController.createRepository);
repoRouter.get("/repo/user/:userID", authMiddleware, repoController.fetchRepositoriesForCurrentUser);
repoRouter.put("/repo/update/:id", authMiddleware, repoController.updateRepositoryById);
repoRouter.delete("/repo/delete/:id", authMiddleware, repoController.deleteRepositoryById);
repoRouter.patch("/repo/toggle/:id", authMiddleware, repoController.toggleVisibilityById);
// Repository file management
repoRouter.post(
    "/repo/:id/files",
    authMiddleware,
    fileController.upload.array("files", 10),
    fileController.uploadFiles
);

repoRouter.get(
    "/repo/:id/files",
    authMiddleware,
    fileController.getRepositoryFiles
);

// Download a repository file
repoRouter.get(
    "/repo/:id/files/download",
    authMiddleware,
    fileController.downloadFile
);

// Repository commit management
repoRouter.post(
    "/repo/:id/commits",
    authMiddleware,
    commitController.createCommit
);

repoRouter.get(
    "/repo/:id/commits",
    authMiddleware,
    commitController.getCommitHistory
);

// Restore a previous commit
repoRouter.post(
    "/repo/:id/commits/restore",
    authMiddleware,
    commitController.restoreCommit
);

module.exports = repoRouter;
