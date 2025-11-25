import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import tournamentRoutes from "./routes/tournament.routes.js";
import cardsRoutes from "./routes/cards.routes.js";
import dotenv from "dotenv";
import session from "express-session";
import pgSession from "connect-pg-simple";
import db from "../database/pg.sql.js";
import http from "http";

dotenv.config();

const app = express();
const PgSession = pgSession(session);
const server = http.createServer(app);

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
      createTableIfMissing: true,
    }),
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
      sameSite: "lax",
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/users", userRoutes);
app.use("/api/tournament", tournamentRoutes);
app.use("/api/cards", cardsRoutes);

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
