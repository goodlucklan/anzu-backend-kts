import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import tournamentRoutes from "./routes/tournament.routes.js";
import cardsRoutes from "./routes/cards.routes.js";
import sellerRoutes from "./routes/seller.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import productsRoutes from "./routes/products.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import dotenv from "dotenv";
import session from "express-session";
import pgSession from "connect-pg-simple";
import db from "../database/pg.sql.js";
import http from "http";
import {
  generalLimiter,
  loginLimiter,
  registerLimiter,
} from "./config/rateLimit.config.js";

dotenv.config();

const app = express();
const PgSession = pgSession(session);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        /^http:\/\/localhost:\d+$/,
        // "https://tu-frontend.vercel.app",
      ];
      if (
        !origin ||
        allowed.some((o) =>
          o instanceof RegExp ? o.test(origin) : o === origin,
        )
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS bloqueado: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
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
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Rate limiting ────────────────────────────────────────────────────────────
app.use(generalLimiter); // aplica a todas las rutas

// Limiters específicos para auth (más estrictos)
app.use("/api/users/login", loginLimiter);
app.use("/api/users/register", registerLimiter);
app.use("/api/seller/vendedores/login", loginLimiter);
app.use("/api/seller/vendedores/registro", registerLimiter);

// ── Rutas ────────────────────────────────────────────────────────────────────
app.use("/api/users", userRoutes);
app.use("/api/tournament", tournamentRoutes);
app.use("/api/cards", cardsRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", ordersRoutes);

// ── Manejador de errores global ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Error no controlado:", err);
  res.status(500).json({
    error: "Error interno del servidor",
  });
});

// ── Server bootstrap ────────────────────────────────────────────────────────
const server = http.createServer(app);

if (process.env.NODE_ENV !== "test") {
  server.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running on port ${process.env.PORT || 3000}`);
  });
}

export default app;
export { server };
