# Anzu Backend TCG Store

API REST para tienda de cartas(TCG) construida con Node.js, Express y PostgreSQL.

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Base de datos**: PostgreSQL con `pg`
- **Auth**: JWT + bcrypt + express-session
- **Validación**: Zod
- **Rate limiting**: express-rate-limit
- **WebSocket**: Socket.io
- **ORM/Query**: Raw SQL (pg Pool)

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Configuración

1. Clonar el repositorio e instalar dependencias:

```bash
npm install
```

2. Copiar y configurar variables de entorno:

```bash
cp .env.example .env
```

3. Completar el archivo `.env` con tus credenciales:

```env
PORT=3000
PGHOST=localhost
PGDATABASE=anzu_db
PGUSER=tu_usuario
PGPASSWORD=tu_contraseña
JWT_SECRET=<64_bytes_hex_generados>
```

4. Generar un secret para JWT:

```bash
node -e "require('crypto').randomBytes(64).toString('hex')"
```

## Scripts

```bash
npm run dev    # Desarrollo con hot-reload (node --watch)
npm start      # Producción
npm test       # Tests (no configurados)
```

## Estructura del proyecto

```
src/
├── index.js              # Entry point, configuración de Express
├── functions.js          # Utilidades compartidas
├── config/
│   └── rateLimit.config.js
├── routes/
│   ├── user.routes.js           # Auth de usuarios
│   ├── seller.routes.js         # Auth de vendedores
│   ├── tournament.routes.js     # Torneos
│   ├── cards.routes.js          # Cartas
│   ├── inventory.routes.js      # Inventario
│   ├── schemas/                 # Schemas Zod para validación
│   │   ├── user.schemas.js
│   │   ├── seller.schemas.js
│   │   └── inventory.schemas.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   └── validate.middleware.js
│   └── config/
│       └── jwt.config.js
database/
└── pg.sql.js            # Pool de PostgreSQL
```

## API Endpoints

### Usuarios
- `POST /api/users/register` - Registro
- `POST /api/users/login` - Login

### Vendedores
- `POST /api/seller/vendedores/registro` - Registro vendedor
- `POST /api/seller/vendedores/login` - Login vendedor

### Cartas
- `GET /api/cards` - Listar cartas
- `GET /api/cards/:id` - Obtener carta

### Torneos
- `GET /api/tournament` - Listar torneos
- `POST /api/tournament` - Crear torneo

### Inventario
- `GET /api/invetory` - Ver inventario

## Seguridad

- Rate limiting en todas las rutas
- Límites específicos más estrictos para endpoints de auth
- Contraseñas hasheadas con bcrypt
- Tokens JWT para autenticación
- Validación de input con Zod
- Cookies httpOnly y sameSite