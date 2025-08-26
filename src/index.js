import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import tournamentRoutes from "./routes/tournament.routes.js";
import dotenv from "dotenv";
import session from "express-session";
import pgSession from "connect-pg-simple";
import db from "../database/pg.sql.js";
import { Server } from "socket.io";
import http from "http";

dotenv.config();

const app = express();
const PgSession = pgSession(session);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(
  session({
    store: new PgSession({
      pool: db,
      tableName: "session",
    }),
    secret: "secret",
    resave: true,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("message", (data) => {
    console.log("Message received:", data);
    io.emit("message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/users", userRoutes);
app.use("/api/tournament", tournamentRoutes);

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
