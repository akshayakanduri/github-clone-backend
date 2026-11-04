
const express = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

const userRouter = express.Router();

// Public routes
userRouter.post("/signup", userController.signup);
userRouter.post("/login", userController.login);

// Protected routes
userRouter.get("/allUsers", authMiddleware, userController.getAllUsers);
userRouter.get("/userProfile/:id", authMiddleware, userController.getUserProfile);
userRouter.put("/updateProfile/:id", authMiddleware, userController.updateUserProfile);
userRouter.delete("/deleteProfile/:id", authMiddleware, userController.deleteUserProfile);

module.exports = userRouter;
