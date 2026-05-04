-- Migration: 002_cart_orders
-- Description: Sistema de carrito persistente y órdenes de pickup en tienda
-- Date: 2026-05-04

-- ============================================================
-- CART (un carrito por usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS cart (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- ============================================================
-- CART_ITEMS (items del carrito)
-- ============================================================
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cart_id, product_id)
);

-- ============================================================
-- ORDERS (órdenes de pickup)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado')),
  pickup_code CHAR(6) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice para buscar por pickup_code (en tienda)
CREATE INDEX IF NOT EXISTS idx_orders_pickup_code ON orders(pickup_code);

-- Índice para listar por usuario
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- ============================================================
-- ORDER_ITEMS (snapshot de items en la orden)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  card_name TEXT NOT NULL,
  precio_snapshot DECIMAL(10,2) NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0)
);

-- Índices para joins rápidos
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Trigger automático para updated_at en cart
CREATE OR REPLACE FUNCTION update_cart_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cart SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.cart_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER cart_items_updated
  AFTER INSERT OR UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_cart_timestamp();

-- Trigger automático para updated_at en orders
CREATE OR REPLACE FUNCTION update_order_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER orders_updated
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_order_timestamp();
