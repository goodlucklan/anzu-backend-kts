// src/seedCards.js
import axios from "axios";
import db from "../database/pg.sql.js";

async function insertCards() {
  try {
    console.log(`Se recibieron ${cards.length} cartas.`);

    for (const card of cards) {
      const {
        id,
        name,
        type,
        humanReadableCardType,
        frameType,
        desc,
        race,
        atk,
        def,
        level,
        attribute,
        archetype,
        ygoprodeck_url,
        typeline = [],
        card_sets = [],
        banlist_info,
        card_images = [],
        card_prices = [],
      } = card;
      console.log("card", card);

      // 1. Insertar carta principal (ON CONFLICT para evitar duplicados)
      await db.query(
        `
        INSERT INTO cards (
          id, name, type, human_readable_card_type, frame_type,
          description, race, atk, def, level, attribute, archetype, ygoprodeck_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          atk = EXCLUDED.atk,
          def = EXCLUDED.def,
          level = EXCLUDED.level,
          attribute = EXCLUDED.attribute,
          archetype = EXCLUDED.archetype
        `,
        [
          id,
          name,
          type,
          humanReadableCardType,
          frameType,
          desc,
          race,
          atk ?? null,
          def ?? null,
          level ?? null,
          attribute ?? null,
          archetype ?? null,
          ygoprodeck_url,
        ]
      );

      // 2. Limpiar e insertar typeline
      await db.query(`DELETE FROM card_types WHERE card_id = $1`, [id]);
      for (const t of typeline) {
        await db.query(
          `INSERT INTO card_types (card_id, type_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, t]
        );
      }

      // 3. Insertar card_sets (printings)
      await db.query(`DELETE FROM card_printings WHERE card_id = $1`, [id]);
      for (const set of card_sets) {
        await db.query(
          `
          INSERT INTO card_printings (
            card_id, set_name, set_code, set_rarity, set_rarity_code, set_price
          ) VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            id,
            set.set_name,
            set.set_code,
            set.set_rarity,
            set.set_rarity_code || null,
            parseFloat(set.set_price) || 0,
          ]
        );
      }

      // 4. banlist_info (puede no existir)
      if (banlist_info) {
        await db.query(
          `
          INSERT INTO banlist_info (card_id, ban_ocg)
          VALUES ($1, $2)
          ON CONFLICT (card_id) DO UPDATE SET ban_ocg = EXCLUDED.ban_ocg
          `,
          [id, banlist_info.ban_ocg || null]
        );
      }

      // 5. card_images (normalmente solo 1)
      await db.query(`DELETE FROM card_images WHERE card_id = $1`, [id]);
      for (const img of card_images) {
        await db.query(
          `
          INSERT INTO card_images (
            card_id, image_url, image_url_small, image_url_cropped
          ) VALUES ($1, $2, $3, $4)
          `,
          [
            id,
            img.image_url,
            img.image_url_small || null,
            img.image_url_cropped || null,
          ]
        );
      }

      // 6. card_prices (normalmente solo 1 objeto)
      await db.query(`DELETE FROM card_prices WHERE card_id = $1`, [id]);
      for (const price of card_prices) {
        await db.query(
          `
          INSERT INTO card_prices (
            card_id,
            cardmarket_price, tcgplayer_price, ebay_price,
            amazon_price, coolstuffinc_price
          ) VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            id,
            parseFloat(price.cardmarket_price) || 0,
            parseFloat(price.tcgplayer_price) || 0,
            parseFloat(price.ebay_price) || 0,
            parseFloat(price.amazon_price) || 0,
            parseFloat(price.coolstuffinc_price) || 0,
          ]
        );
      }
    }

    await db.query("COMMIT");
    console.log("Todas las cartas se insertaron/actualizaron correctamente.");
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Error durante la inserción:", err);
    throw err;
  } finally {
    db.release();
  }
}

// Ejecutar
insertCards()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
