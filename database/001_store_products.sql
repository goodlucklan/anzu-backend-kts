-- Migration: 001_store_products
-- Description: Tabla de productos de tienda vinculados a cartas Yu-Gi-Oh
-- Date: 2026-05-04

CREATE TABLE IF NOT EXISTS store_products (
  id SERIAL PRIMARY KEY,
  card_id BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(card_id)
);

-- Índice para consultas públicas (solo productos activos)
CREATE INDEX IF NOT EXISTS idx_store_products_activo ON store_products(activo);

COMMENT ON TABLE store_products IS 'Productos de tienda vinculados a cartas de Yu-Gi-Oh (YgoproDeck)';
COMMENT ON COLUMN store_products.card_id IS 'FK a la tabla cards (YgoproDeck)';
COMMENT ON COLUMN store_products.precio IS 'Precio en moneda local (ej: USD, ARS)';
COMMENT ON COLUMN store_products.stock IS 'Cantidad disponible para pickup en tienda';
COMMENT ON COLUMN store_products.activo IS 'Si es false, no aparece en catálogo público';
