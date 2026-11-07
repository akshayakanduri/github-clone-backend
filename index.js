const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const mainRouter = require("./routes/main.router");

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

const { initRepo } = require("./controllers/init");
const { addRepo } = require("./controllers/add");
const { commitRepo } = require("./controllers/commit");
const { pushRepo } = require("./controllers/push");
const { pullRepo } = require("./controllers/pull");
const { revertRepo } = require("./controllers/revert");

dotenv.config();

yargs(hideBin(process.argv))
    .command("start", "Starts the server", {}, startServer)
    .command("init", "Initialize a repository", {}, initRepo)
    .command(
        "add <file>",
        "Add a file to staging",
        (yargs) => {
            yargs.positional("file", {
                describe: "File to add",
                type: "string"
            });
        },
        (argv) => addRepo(argv.file)
    )
    .command(
        "commit <message>",
        "Commit staged files",
        (yargs) => {
            yargs.positional("message", {
                describe: "Commit message",
                type: "string"
            });
        },
        (argv) => commitRepo(argv.message)
    )
    .command("push", "Push commits to S3", {}, pushRepo)
    .command("pull", "Pull commits from S3", {}, pullRepo)
    .command(
        "revert <commitID>",
        "Revert to a commit",
        (yargs) => {
            yargs.positional("commitID", {
                describe: "Commit ID",
                type: "string"
            });
        },
        (argv) => revertRepo(argv.commitID)
    )
    .demandCommand(1, "You need at least one command")
    .help()
    .argv;

async function startServer() {
    const app = express();

    const port = process.env.PORT || 3000;
    const mongoURI = process.env.MONGODB_URI;
    const frontendURL = process.env.FRONTEND_URL;

    if (!mongoURI) {
        console.error("MONGODB_URI is missing");
        process.exit(1);
    }

    if (!frontendURL) {
        console.error("FRONTEND_URL is missing");
        process.exit(1);
    }

    // app.use(cors({
    //     origin: [
    //         "https://main.d19kioom3vkpfo.amplifyapp.com"
    //     ],
    //     credentials: true
    // }));
    const allowedOrigins = [
        frontendURL,
        "http://localhost:5173"
    ];

    app.use(cors({
        origin: allowedOrigins
    }));

    app.use(express.json());

    app.use("/", mainRouter);

    const httpServer = http.createServer(app);

    // const io = new Server(httpServer, {
    //     cors: {
    //         origin: [
    //             "https://main.d19kioom3vkpfo.amplifyapp.com"
    //         ],
    //         methods: ["GET", "POST"],
    //         credentials: true
    //     }
    // });
    const io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        socket.on("joinroom", (userID) => {
            if (typeof userID !== "string" || !userID) {
                return;
            }

            console.log("User joined room:", userID);
            socket.join(userID);
        });
    });

    try {
        await mongoose.connect(mongoURI);

        console.log("MongoDB connected!");

        httpServer.listen(port, "0.0.0.0", () => {
            console.log(`Server is running on PORT ${port}`);
        });

    } catch (err) {
        console.error("Unable to connect to MongoDB:", err.message);
        process.exit(1);
    }
}
