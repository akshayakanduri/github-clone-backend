
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");
const dotenv = require("dotenv");

dotenv.config();

const uri = process.env.MONGODB_URI;
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

let client;

async function connectClient() {
    if (!client) {
        if (!uri) {
            throw new Error("MONGODB_URI is missing");
        }

        client = new MongoClient(uri);
        await client.connect();
    }
}

// Signup
async function signup(req, res) {
    const { username, password, email } = req.body;

    try {
        if (!username || !password || !email) {
            return res.status(400).json({
                message: "Username, email and password are required"
            });
        }

        if (!JWT_SECRET_KEY) {
            throw new Error("JWT_SECRET_KEY is missing");
        }

        await connectClient();

        const usersCollection = client.db("moigithub").collection("users");

        const existingUser = await usersCollection.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(409).json({
                message: "Username or email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            username,
            password: hashedPassword,
            email,
            repositories: [],
            followedUsers: [],
            starRepos: []
        };

        const result = await usersCollection.insertOne(newUser);

        const token = jwt.sign(
            { id: result.insertedId.toString() },
            JWT_SECRET_KEY,
            { expiresIn: "1h" }
        );

        return res.status(201).json({
            token,
            userId: result.insertedId
        });

    } catch (err) {
        console.error("Signup error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Login
async function login(req, res) {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        if (!JWT_SECRET_KEY) {
            throw new Error("JWT_SECRET_KEY is missing");
        }

        await connectClient();

        const usersCollection = client.db("moigithub").collection("users");

        const user = await usersCollection.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: "Invalid credentials"
            });
        }

        const token = jwt.sign(
            { id: user._id.toString() },
            JWT_SECRET_KEY,
            { expiresIn: "1h" }
        );

        return res.json({
            token,
            userId: user._id
        });

    } catch (err) {
        console.error("Login error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Get all users
async function getAllUsers(req, res) {
    try {
        await connectClient();

        const usersCollection = client.db("moigithub").collection("users");

        const users = await usersCollection
            .find({}, { projection: { password: 0 } })
            .toArray();

        return res.json(users);

    } catch (err) {
        console.error("Fetch users error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Get user profile
async function getUserProfile(req, res) {
    const currentID = req.params.id;

    try {
        if (!ObjectId.isValid(currentID)) {
            return res.status(400).json({
                message: "Invalid user ID"
            });
        }

        await connectClient();

        const usersCollection = client.db("moigithub").collection("users");

        const user = await usersCollection.findOne(
            { _id: new ObjectId(currentID) },
            { projection: { password: 0 } }
        );

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.json(user);

    } catch (err) {
        console.error("Fetch profile error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Update user profile
async function updateUserProfile(req, res) {
    const currentID = req.params.id;
    const { email, password } = req.body;

    try {
        if (!ObjectId.isValid(currentID)) {
            return res.status(400).json({
                message: "Invalid user ID"
            });
        }

        // Verify profile ownership
        if (req.user.id !== currentID) {
            return res.status(403).json({
                message: "You can only modify your own profile"
            });
        }

        if (!email && !password) {
            return res.status(400).json({
                message: "At least one field is required"
            });
        }

        await connectClient();

        const usersCollection = client.db("moigithub").collection("users");

        const updateFields = {};

        if (email) {
            const existingEmail = await usersCollection.findOne({
                email,
                _id: { $ne: new ObjectId(currentID) }
            });

            if (existingEmail) {
                return res.status(409).json({
                    message: "Email already exists"
                });
            }

            updateFields.email = email;
        }

        if (password) {
            updateFields.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await usersCollection.findOneAndUpdate(
            { _id: new ObjectId(currentID) },
            { $set: updateFields },
            {
                returnDocument: "after",
                projection: { password: 0 },
                includeResultMetadata: false
            }
        );

        if (!updatedUser) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.json(updatedUser);

    } catch (err) {
        console.error("Update profile error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

// Delete user profile
async function deleteUserProfile(req, res) {
    const currentID = req.params.id;

    try {
        if (!ObjectId.isValid(currentID)) {
            return res.status(400).json({
                message: "Invalid user ID"
            });
        }

        // Verify profile ownership
        if (req.user.id !== currentID) {
            return res.status(403).json({
                message: "You can only delete your own profile"
            });
        }

        await connectClient();

        const usersCollection = client.db("moigithub").collection("users");

        const result = await usersCollection.deleteOne({
            _id: new ObjectId(currentID)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.json({
            message: "User profile deleted successfully"
        });

    } catch (err) {
        console.error("Delete profile error:", err.message);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

module.exports = {
    getAllUsers,
    signup,
    login,
    getUserProfile,
    updateUserProfile,
    deleteUserProfile
};
