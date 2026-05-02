import request from "supertest";
import bcrypt from "bcrypt";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ── Mock de la base de datos antes de importar app ────────────────────────────
const mockQuery = jest.fn();
jest.unstable_mockModule("../database/pg.sql.js", () => ({
  default: { query: mockQuery },
  query: mockQuery,
}));

// ── Importar después del mock ───────────────────────────────────────────────
const { default: app } = await import("./index.js");
const { default: db } = await import("../database/pg.sql.js");
import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "./routes/config/jwt.config.js";

// ════════════════════════════════════════════════════════════════════════════════
// USERS API
// ════════════════════════════════════════════════════════════════════════════════

describe("Users API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/users/register", () => {
    it("devuelve 201 al registrar un usuario válido", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // verificar usuario existente
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              username: "testuser",
              email: "test@test.com",
              dni: "12345678",
              user_type: "cliente",
              created_at: new Date(),
            },
          ],
        }) // INSERT usuario
        .mockResolvedValueOnce({}) // INSERT rol
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/users/register")
        .send({
          username: "testuser",
          password: "Password123!",
          email: "test@test.com",
          dni: "12345678",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("token");
      expect(res.body.user.username).toBe("testuser");
    });

    it("devuelve 409 si el username ya existe", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ conflict_field: "username" }],
        }); // usuario existente

      const res = await request(app)
        .post("/api/users/register")
        .send({
          username: "testuser",
          password: "Password123!",
          email: "test@test.com",
          dni: "12345678",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("username");
    });

    it("devuelve 409 si el email ya existe", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ conflict_field: "email" }],
        });

      const res = await request(app)
        .post("/api/users/register")
        .send({
          username: "newuser",
          password: "Password123!",
          email: "existing@test.com",
          dni: "87654321",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("email");
    });

    it("devuelve 400 si faltan campos requeridos", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({
          username: "testuser",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/users/login", () => {
    it("devuelve token al hacer login con credenciales válidas", async () => {
      const hashedPassword = await bcrypt.hash("Password123!", 10);
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              username: "testuser",
              password_hash: hashedPassword,
              email: "test@test.com",
              dni: "12345678",
              user_type: "cliente",
              is_active: true,
            },
          ],
        }) // buscar usuario
        .mockResolvedValueOnce({ rows: [{ role: "cliente" }] }) // roles
        .mockResolvedValueOnce({}); // UPDATE last login

      const res = await request(app)
        .post("/api/users/login")
        .send({
          username: "testuser",
          password: "Password123!",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(res.body.user.username).toBe("testuser");
    });

    it("devuelve 401 con credenciales inválidas", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // usuario no encontrado

      const res = await request(app)
        .post("/api/users/login")
        .send({
          username: "nouser",
          password: "wrongpass",
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Credenciales inválidas");
    });

    it("devuelve 403 si el usuario está desactivado", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: "inactive",
            password_hash: "$2b$10$placeholder",
            is_active: false,
          },
        ],
      });

      const res = await request(app)
        .post("/api/users/login")
        .send({
          username: "inactive",
          password: "anypass",
        });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/users/verify", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app).get("/api/users/verify");
      expect(res.status).toBe(401);
    });

    it("devuelve usuario válido con token válido", async () => {
      const token = jwt.sign(
        { id: 1, username: "testuser", user_type: "cliente" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              username: "testuser",
              email: "test@test.com",
              user_type: "cliente",
              is_active: true,
            },
          ],
        }) // buscar usuario
        .mockResolvedValueOnce({ rows: [{ role: "cliente" }] }); // roles

      const res = await request(app)
        .get("/api/users/verify")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it("devuelve 401 si el usuario no existe o está inactivo", async () => {
      const token = jwt.sign(
        { id: 999, username: "ghost", user_type: "cliente" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery.mockResolvedValueOnce({ rows: [] }); // usuario no encontrado

      const res = await request(app)
        .get("/api/users/verify")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/users/upgrade-to-seller", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app)
        .post("/api/users/upgrade-to-seller");
      expect(res.status).toBe(401);
    });

    it("devuelve 400 si el usuario ya es vendedor", async () => {
      const token = jwt.sign(
        { id: 1, username: "testuser", user_type: "cliente" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // ya es vendedor

      const res = await request(app)
        .post("/api/users/upgrade-to-seller")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("ya es vendedor");
    });

    it("promueve usuario a vendedor exitosamente", async () => {
      const token = jwt.sign(
        { id: 1, username: "testuser", user_type: "cliente" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // no es vendedor
        .mockResolvedValueOnce({}) // INSERT rol
        .mockResolvedValueOnce({}) // UPDATE user_type
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/users/upgrade-to-seller")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("actualizado");
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// CARDS API
// ════════════════════════════════════════════════════════════════════════════════

describe("Cards API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/cards/verifyCards", () => {
    it("devuelve la cantidad de cartas", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: "42" }] }); // COUNT

      const res = await request(app).get("/api/cards/verifyCards");

      expect(res.status).toBe(200);
      expect(res.body.data.totalCards).toBe(42);
    });

    it("maneja errores de base de datos", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("DB connection failed"));

      const res = await request(app).get("/api/cards/verifyCards");

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/cards/getCards", () => {
    it("inserta cartas y devuelve métricas", async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE card_types
        .mockResolvedValueOnce({ rows: [] }) // DELETE card_printings
        .mockResolvedValueOnce({ rows: [] }) // DELETE card_images
        .mockResolvedValueOnce({ rows: [] }) // DELETE card_prices
        .mockResolvedValueOnce({}) // INSERT cards
        .mockResolvedValueOnce({}) // INSERT card_types
        .mockResolvedValueOnce({}) // INSERT card_printings
        .mockResolvedValueOnce({}) // INSERT banlist_info
        .mockResolvedValueOnce({}) // INSERT card_images
        .mockResolvedValueOnce({}) // INSERT card_prices
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app).get("/api/cards/getCards");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
    });
  });

  describe("GET /api/cards/searchCards", () => {
    it("devuelve 400 si no se pasa el parámetro name", async () => {
      const res = await request(app).get("/api/cards/searchCards");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("name");
    });

    it("devuelve cartas que matchean el nombre", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "2" }] }) // COUNT
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1234,
              name: "Dark Magician",
              type: "Monster",
              humanReadableCardType: "Normal Monster",
              frameType: "monster",
              desc: "The ultimate wizard.",
              race: "Spellcaster",
              atk: 2500,
              def: 2000,
              level: 7,
              attribute: "DARK",
              archetype: null,
              ygoprodeck_url: "https://yugioh.fandom.com/wiki/Dark_Magician",
            },
          ],
        }) // SELECT cards
        .mockResolvedValueOnce({ rows: [] }) // card_types
        .mockResolvedValueOnce({ rows: [] }) // card_printings
        .mockResolvedValueOnce({ rows: [] }) // banlist_info
        .mockResolvedValueOnce({ rows: [] }) // card_images
        .mockResolvedValueOnce({ rows: [] }); // card_prices

      const res = await request(app)
        .get("/api/cards/searchCards")
        .query({ name: "Dark Magician" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe("Dark Magician");
      expect(res.body.total).toBe(2);
    });

    it("devuelve array vacío cuando no hay resultados", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // COUNT
        .mockResolvedValueOnce({ rows: [] }); // SELECT cards (vacío)

      const res = await request(app)
        .get("/api/cards/searchCards")
        .query({ name: "NonExistentCard" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SELLER API
// ════════════════════════════════════════════════════════════════════════════════

describe("Seller API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("POST /api/seller/vendedores/registro", () => {
    it("devuelve 201 al registrar vendedor válido", async () => {
      const hashedPassword = await bcrypt.hash("Password123!", 10);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            vendedor_id: 1,
            nombres: "Juan",
            apellidos: "Pérez",
            correo: "juan@test.com",
            dni: "12345678",
            konami_id: null,
            whatsapp: null,
            instagram: null,
            facebook: null,
            otro: null,
            created_at: new Date(),
            activo: true,
          },
        ],
      });

      const res = await request(app)
        .post("/api/seller/vendedores/registro")
        .send({
          nombres: "Juan",
          apellidos: "Pérez",
          correo: "juan@test.com",
          password: "Password123!",
          dni: "12345678",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("token");
      expect(res.body.vendedor.nombres).toBe("Juan");
    });

    it("devuelve 409 si el correo ya existe", async () => {
      const err = new Error("Unique violation");
      err.code = "23505";
      err.constraint = "vendedores_correo_key";
      mockQuery.mockRejectedValueOnce(err);

      const res = await request(app)
        .post("/api/seller/vendedores/registro")
        .send({
          nombres: "Juan",
          apellidos: "Pérez",
          correo: "existing@test.com",
          password: "Password123!",
          dni: "87654321",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("correo");
    });

    it("devuelve 409 si el DNI ya existe", async () => {
      const err = new Error("Unique violation");
      err.code = "23505";
      err.constraint = "vendedores_dni_key";
      mockQuery.mockRejectedValueOnce(err);

      const res = await request(app)
        .post("/api/seller/vendedores/registro")
        .send({
          nombres: "Juan",
          apellidos: "Pérez",
          correo: "new@test.com",
          password: "Password123!",
          dni: "12345678",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("DNI");
    });
  });

  describe("POST /api/seller/vendedores/login", () => {
    it("devuelve token con credenciales válidas", async () => {
      const hashedPassword = await bcrypt.hash("Password123!", 10);
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              vendedor_id: 1,
              correo: "juan@test.com",
              password_hash: hashedPassword,
              activo: true,
              intentos_fallidos: 0,
              bloqueado_hasta: null,
            },
          ],
        }) // buscar vendedor
        .mockResolvedValueOnce({}); // UPDATE login

      const res = await request(app)
        .post("/api/seller/vendedores/login")
        .send({
          correo: "juan@test.com",
          password: "Password123!",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
    });

    it("devuelve 401 con credenciales inválidas", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // vendedor no encontrado

      const res = await request(app)
        .post("/api/seller/vendedores/login")
        .send({
          correo: "nobody@test.com",
          password: "wrongpass",
        });

      expect(res.status).toBe(401);
    });

    it("devuelve 423 si la cuenta está bloqueada", async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            vendedor_id: 1,
            correo: "juan@test.com",
            password_hash: await bcrypt.hash("Password123!", 10),
            activo: true,
            intentos_fallidos: 5,
            bloqueado_hasta: futureDate,
          },
        ],
      });

      const res = await request(app)
        .post("/api/seller/vendedores/login")
        .send({
          correo: "juan@test.com",
          password: "Password123!",
        });

      expect(res.status).toBe(423);
    });

    it("devuelve 403 si la cuenta está desactivada", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            vendedor_id: 1,
            correo: "juan@test.com",
            password_hash: await bcrypt.hash("Password123!", 10),
            activo: false,
            intentos_fallidos: 0,
            bloqueado_hasta: null,
          },
        ],
      });

      const res = await request(app)
        .post("/api/seller/vendedores/login")
        .send({
          correo: "juan@test.com",
          password: "Password123!",
        });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/seller/vendedores/perfil", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app).get("/api/seller/vendedores/perfil");
      expect(res.status).toBe(401);
    });

    it("devuelve perfil de vendedor autenticado", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "juan@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            vendedor_id: 1,
            nombres: "Juan",
            apellidos: "Pérez",
            correo: "juan@test.com",
            dni: "12345678",
            konami_id: null,
            whatsapp: null,
            instagram: null,
            facebook: null,
            otro: null,
            ultimo_login: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            activo: true,
            email_verificado: false,
          },
        ],
      });

      const res = await request(app)
        .get("/api/seller/vendedores/perfil")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.vendedor.nombres).toBe("Juan");
    });

    it("devuelve 404 si el vendedor no existe", async () => {
      const token = jwt.sign(
        { vendedor_id: 999, correo: "ghost@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/seller/vendedores/perfil")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/seller/vendedores", () => {
    it("devuelve lista de vendedores activos", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              vendedor_id: 1,
              nombres: "Juan",
              apellidos: "Pérez",
              konami_id: "1234567890",
              whatsapp: null,
              instagram: null,
              facebook: null,
              otro: null,
              created_at: new Date(),
            },
          ],
        }) // SELECT vendedores
        .mockResolvedValueOnce({ rows: [{ count: "1" }] }); // COUNT

      const res = await request(app).get("/api/seller/vendedores");

      expect(res.status).toBe(200);
      expect(res.body.vendedores).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it("filtra vendedores por search", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              vendedor_id: 1,
              nombres: "Juan",
              apellidos: "Pérez",
              konami_id: "1234567890",
              whatsapp: null,
              instagram: null,
              facebook: null,
              otro: null,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: "1" }] });

      const res = await request(app)
        .get("/api/seller/vendedores")
        .query({ search: "Juan", limit: 10, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body.vendedores).toHaveLength(1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FUNCTIONS (functions.js coverage)
// ════════════════════════════════════════════════════════════════════════════════

describe("functions.js › insertCards", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // Mock del módulo data.js para evitar "module not found"
  beforeAll(async () => {
    jest.unstable_mockModule("../data.js", () => ({
      data: [],
    }));
  });

  it("inserta una carta y devuelve el resultado", async () => {
    const { insertCards } = await import("./functions.js");

    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1234, name: "Dark Magician" }],
    });

    const fakeCards = [
      {
        id: 1234,
        name: "Dark Magician",
        type: "Monster",
        humanReadableCardType: "Normal Monster",
        frameType: "monster",
        desc: "The ultimate wizard.",
        race: "Spellcaster",
        atk: 2500,
        def: 2000,
        level: 7,
        attribute: "DARK",
        archetype: null,
        ygoprodeck_url: "https://yugioh.fandom.com/wiki/Dark_Magician",
      },
    ];

    const results = await insertCards(fakeCards);
    expect(results).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("inserta múltiples cartas y devuelve múltiples resultados", async () => {
    const { insertCards } = await import("./functions.js");

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2 }] });

    const fakeCards = [
      {
        id: 1,
        name: "Dark Magician",
        type: "Monster",
        humanReadableCardType: "Normal Monster",
        frameType: "monster",
        desc: "Desc 1",
        race: "Spellcaster",
        atk: 2500,
        def: 2000,
        level: 7,
        attribute: "DARK",
        archetype: null,
        ygoprodeck_url: "url1",
      },
      {
        id: 2,
        name: "Blue-Eyes White Dragon",
        type: "Monster",
        humanReadableCardType: "Normal Monster",
        frameType: "monster",
        desc: "Desc 2",
        race: "Dragon",
        atk: 3000,
        def: 2500,
        level: 8,
        attribute: "LIGHT",
        archetype: "Blue-Eyes",
        ygoprodeck_url: "url2",
      },
    ];

    const results = await insertCards(fakeCards);
    expect(results).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("produce error cuando la base de datos falla", async () => {
    const { insertCards } = await import("./functions.js");

    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

    const fakeCards = [
      {
        id: 999,
        name: "ErrorCard",
        type: "Monster",
        humanReadableCardType: "Normal Monster",
        frameType: "monster",
        desc: "Desc",
        race: "Spellcaster",
        atk: 0,
        def: 0,
        level: 1,
        attribute: "DARK",
        archetype: null,
        ygoprodeck_url: "url",
      },
    ];

    await expect(insertCards(fakeCards)).rejects.toThrow("Connection refused");
  });

  it("pasa valores nulos al INSERT cuando los campos opcionales faltan", async () => {
    const { insertCards } = await import("./functions.js");

    let capturedArgs;
    mockQuery.mockImplementationOnce((sql, args) => {
      capturedArgs = args;
      return { rows: [] };
    });

    const fakeCards = [
      {
        id: 1,
        name: "MinimalCard",
        type: "Monster",
        humanReadableCardType: "Normal Monster",
        frameType: "monster",
        desc: "Desc",
        race: "Spellcaster",
        atk: null,
        def: null,
        level: null,
        attribute: null,
        archetype: null,
        ygoprodeck_url: "url",
      },
    ];

    await insertCards(fakeCards);

    // Posiciones: 0=id,1=name,2=type,3=humanReadableCardType,4=frameType,
    // 5=desc,6=race, 7=atk,8=def,9=level,10=attribute,11=archetype,12=ygoprodeck_url
    expect(capturedArgs[7]).toBeNull();  // atk
    expect(capturedArgs[8]).toBeNull();  // def
    expect(capturedArgs[9]).toBeNull(); // level
    expect(capturedArgs[10]).toBeNull(); // attribute
    expect(capturedArgs[11]).toBeNull(); // archetype
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// INVENTORY API
// ════════════════════════════════════════════════════════════════════════════════

describe("Inventory API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("POST /api/invetory/inventario", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app)
        .post("/api/invetory/inventario")
        .send({ card_id: 1, cantidad: 1 });
      expect(res.status).toBe(401);
    });

    it("devuelve 404 si la carta no existe", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery
        .mockResolvedValueOnce({
          rows: [],
        }) // card not found
        .mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app)
        .post("/api/invetory/inventario")
        .set("Authorization", `Bearer ${token}`)
        .send({ card_id: 999, cantidad: 1 });

      expect(res.status).toBe(404);
    });

    it("agrega carta al inventario exitosamente", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1234, name: "Dark Magician" }],
        }) // card check
        .mockResolvedValueOnce({
          rows: [
            {
              inventario_id: 1,
              card_id: 1234,
              vendedor_id: 1,
              cantidad: 1,
              precio: 10,
              condicion: "Near Mint",
              idioma: "Inglés",
              edicion: null,
              notas: null,
            },
          ],
        }); // INSERT

      const res = await request(app)
        .post("/api/invetory/inventario")
        .set("Authorization", `Bearer ${token}`)
        .send({ card_id: 1234, cantidad: 1 });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain("agregada");
    });
  });

  describe("GET /api/invetory/inventario/mi-inventario", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app).get("/api/invetory/inventario/mi-inventario");
      expect(res.status).toBe(401);
    });

    it("devuelve inventario con estadísticas", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              inventario_id: 1,
              card_id: 1234,
              name: "Dark Magician",
              type: "Monster",
              race: "Spellcaster",
              attribute: "DARK",
              archetype: null,
              atk: 2500,
              def: 2000,
              level: 7,
              cantidad: 1,
              precio: 10,
              condicion: "Near Mint",
              idioma: "Inglés",
              edicion: null,
              notas: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        }) // SELECT inventario
        .mockResolvedValueOnce({
          rows: [
            {
              total_cartas_unicas: "1",
              total_cartas: "1",
              precio_promedio: "10",
              precio_maximo: "10",
            },
          ],
        }); // stats

      const res = await request(app)
        .get("/api/invetory/inventario/mi-inventario")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.inventario).toHaveLength(1);
      expect(res.body.estadisticas).toBeDefined();
    });
  });

  describe("GET /api/invetory/inventario/buscar/:card_id", () => {
    it("devuelve vendedores con la carta", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            card_id: 1234,
            card_name: "Dark Magician",
            vendedor_id: 1,
            vendedor_nombre: "Juan Pérez",
            konami_id: "1234567890",
            whatsapp: null,
            instagram: null,
            precio: 10,
            condicion: "Near Mint",
            idioma: "Inglés",
          },
        ],
      });

      const res = await request(app)
        .get("/api/invetory/inventario/buscar/1234")
        .query({ precio_max: 50 });

      expect(res.status).toBe(200);
      expect(res.body.vendedores).toHaveLength(1);
    });

    it("devuelve array vacío cuando no hay resultados", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/invetory/inventario/buscar/9999");

      expect(res.status).toBe(200);
      expect(res.body.vendedores).toHaveLength(0);
    });
  });

  describe("GET /api/invetory/inventario/buscar-nombre/:nombre", () => {
    it("devuelve resultados por nombre", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            card_id: 1234,
            card_name: "Dark Magician",
            precio: 10,
            condicion: "Near Mint",
            idioma: "Inglés",
          },
        ],
      });

      const res = await request(app)
        .get("/api/invetory/inventario/buscar-nombre/Dark Magician")
        .query({ limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.resultados).toHaveLength(1);
    });
  });

  describe("GET /api/invetory/inventario/vendedor/:vendedor_id", () => {
    it("devuelve inventario de un vendedor", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            card_id: 1234,
            card_name: "Dark Magician",
            vendedor_id: 1,
            vendedor_nombre: "Juan Pérez",
            konami_id: "1234567890",
            whatsapp: null,
            instagram: null,
            precio: 10,
            condicion: "Near Mint",
            idioma: "Inglés",
          },
        ],
      });

      const res = await request(app)
        .get("/api/invetory/inventario/vendedor/1")
        .query({ search: "Dark" });

      expect(res.status).toBe(200);
      expect(res.body.inventario).toHaveLength(1);
    });

    it("devuelve array vacío si el vendedor no tiene inventario", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/invetory/inventario/vendedor/999");

      expect(res.status).toBe(200);
    });
  });

  describe("PUT /api/invetory/inventario/:inventario_id", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app)
        .put("/api/invetory/inventario/1")
        .send({ cantidad: 5 });
      expect(res.status).toBe(401);
    });

    it("devuelve 404 si la entrada no existe", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery.mockResolvedValueOnce({ rows: [] }); // no existe

      const res = await request(app)
        .put("/api/invetory/inventario/999")
        .set("Authorization", `Bearer ${token}`)
        .send({ cantidad: 5 });

      expect(res.status).toBe(404);
    });

    it("actualiza inventario exitosamente", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ inventario_id: 1, cantidad: 1 }],
        }) // check
        .mockResolvedValueOnce({
          rows: [{ inventario_id: 1, cantidad: 5 }],
        }); // UPDATE

      const res = await request(app)
        .put("/api/invetory/inventario/1")
        .set("Authorization", `Bearer ${token}`)
        .send({ cantidad: 5 });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("actualizado");
    });
  });

  describe("DELETE /api/invetory/inventario/:inventario_id", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app)
        .delete("/api/invetory/inventario/1");
      expect(res.status).toBe(401);
    });

    it("devuelve 404 si la entrada no existe", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete("/api/invetory/inventario/999")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it("elimina carta exitosamente", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      mockQuery.mockResolvedValueOnce({
        rows: [{ inventario_id: 1, card_id: 1234 }],
      });

      const res = await request(app)
        .delete("/api/invetory/inventario/1")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("eliminada");
    });
  });

  describe("POST /api/invetory/inventario/bulk", () => {
    it("devuelve 401 sin token", async () => {
      const res = await request(app)
        .post("/api/invetory/inventario/bulk")
        .send({ cartas: [] });
      expect(res.status).toBe(401);
    });

    it("agrega múltiples cartas al inventario", async () => {
      const token = jwt.sign(
        { vendedor_id: 1, correo: "vendedor@test.com" },
        JWT_CONFIG.secret,
        { expiresIn: JWT_CONFIG.expiresIn }
      );

      // Mock del client con query
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ inventario_id: 1, card_id: 1234 }] }) // INSERT card 1
          .mockResolvedValueOnce({ rows: [{ inventario_id: 2, card_id: 5678 }] }) // INSERT card 2
          .mockResolvedValueOnce({}), // COMMIT
        release: jest.fn(),
      };

      db.connect = jest.fn().mockResolvedValue(mockClient);

      const res = await request(app)
        .post("/api/invetory/inventario/bulk")
        .set("Authorization", `Bearer ${token}`)
        .send({
          cartas: [
            { card_id: 1234, cantidad: 1 },
            { card_id: 5678, cantidad: 2 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.inventario).toHaveLength(2);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// TOURNAMENT API
// ════════════════════════════════════════════════════════════════════════════════

describe("Tournament API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("POST /api/tournament/createTournament", () => {
    it("crea un torneo exitosamente", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: "Torneo 1", participants: 0, maxPlayers: 8 }],
      });

      const res = await request(app)
        .post("/api/tournament/createTournament")
        .send({ name: "Torneo 1" });

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/tournament/getTournaments", () => {
    it("devuelve lista de torneos", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, name: "Torneo 1", participants: 0, maxPlayers: 8 },
          { id: 2, name: "Torneo 2", participants: 2, maxPlayers: 8 },
        ],
      });

      const res = await request(app).get("/api/tournament/getTournaments");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it("maneja errores de base de datos", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app).get("/api/tournament/getTournaments");

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/tournament/addPlayerInTournament", () => {
    it("devuelve 404 si el torneo no existe", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // torneo no encontrado

      const res = await request(app)
        .post("/api/tournament/addPlayerInTournament")
        .send({ konamiid: "1234567890", name: "Juan", idtournament: 999 });

      expect(res.status).toBe(404);
    });

    it("devuelve 400 si el torneo está lleno", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: "Torneo 1", participants: 8, maxPlayers: "8" }],
      });

      const res = await request(app)
        .post("/api/tournament/addPlayerInTournament")
        .send({ konamiid: "1234567890", name: "Juan", idtournament: 1 });

      expect(res.status).toBe(400);
      expect(res.text).toContain("máximo");
    });

    it("agrega jugador exitosamente", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Torneo 1", participants: 2, maxPlayers: "8" }],
        }) // SELECT torneo
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT jugador
        .mockResolvedValueOnce({
          rows: [{ count: "3" }],
        }) // COUNT
        .mockResolvedValueOnce({}); // UPDATE participants

      const res = await request(app)
        .post("/api/tournament/addPlayerInTournament")
        .send({ konamiid: "1234567890", name: "Juan", idtournament: 1 });

      expect(res.status).toBe(200);
    });
  });

  describe("PUT /api/tournament/upgradeResultPlayerInTournament", () => {
    it("actualiza resultado del jugador", async () => {
      mockQuery.mockResolvedValueOnce({}); // UPDATE

      const res = await request(app)
        .put("/api/tournament/upgradeResultPlayerInTournament")
        .send({ konamiid: "1234567890", idtournament: 1, victory: 1, defeat: 0, draw: 0 });

      expect(res.status).toBe(200);
    });

    it("maneja errores de base de datos", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));

      const res = await request(app)
        .put("/api/tournament/upgradeResultPlayerInTournament")
        .send({ konamiid: "1234567890", idtournament: 1, victory: 1, defeat: 0, draw: 0 });

      expect(res.status).toBe(500);
    });
  });
});