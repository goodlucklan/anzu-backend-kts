import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import dotenv from "dotenv";
import session from "express-session";
import pgSession from "connect-pg-simple"; // Importa la función
import db from "../database/pg.sql.js";

dotenv.config();

const app = express();
const PgSession = pgSession(session);
// Configuración de CORS debe ir antes de las rutas
app.use(
  cors({
    origin: "http://localhost:5173", // Permitir solo tu frontend local
    credentials: true, // Permite enviar cookies de sesión al frontend
    methods: ["GET", "POST", "PUT", "DELETE"], // Métodos permitidos
  })
);

app.use(
  session({
    store: new PgSession({
      pool: db, // Conexión a PostgreSQL
      tableName: "session", // Nombre de la tabla para sesiones
    }),
    secret: "secret",
    resave: true,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 día
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Rutas deben ir después de configurar CORS
app.use(userRoutes);

app.listen(process.env.PORT, () => {
  console.log(`SERVER IS RUNNING IN PORT ${process.env.PORT}`);
});
