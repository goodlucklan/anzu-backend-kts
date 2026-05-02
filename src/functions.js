// functions.js
import db from "../database/pg.sql.js";
import { data } from "../data.js";

export async function insertCards(cards = data) {
  // ← acepta datos externos
  const results = [];

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
    } = card;

    const cardResult = await db.query(
      `
      INSERT INTO "cards" (
        id, name, type, human_readable_card_type, frame_type,
        description, race, atk, def, level, attribute, archetype, ygoprodeck_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
      ],
    );
    results.push(cardResult.rows);
  }

  return results;
}

// Solo ejecutar si se llama directamente, no cuando se importa
if (process.argv[1].endsWith("functions.js")) {
  insertCards().catch(console.error);
}
