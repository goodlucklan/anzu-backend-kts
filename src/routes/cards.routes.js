import { Router } from "express";
import db from "../../database/pg.sql.js";
import axios from "axios";

const router = Router();

router.get("/verifyCards", async (req, res) => {
  try {
    await db.query("BEGIN");
    const cardCountResult = await db.query(`SELECT COUNT(*) FROM cards`);
    res.send({
      message: "Cantidad de cartas en la base de datos",
      data: {
        totalCards: parseInt(cardCountResult.rows[0].count, 10),
      },
    });
  } catch (error) {
    console.error("Error al verificar cartas:", error);
    res.status(500).send("Error en el servidor");
  }
});

router.get("/getCards", async (req, res) => {
  try {
    await db.query("BEGIN");

    const dataApi = await axios.get(
      "https://db.ygoprodeck.com/api/v7/cardinfo.php"
    );
    const cardsData = dataApi.data.data;
    console.log("📦 Cartas encontradas:", dataApi.data.data.length);

    // ========== 1. INSERTAR CARDS ==========
    const ids = [];
    const names = [];
    const types = [];
    const humanReadableCardTypes = [];
    const frameTypes = [];
    const descriptions = [];
    const races = [];
    const atks = [];
    const defs = [];
    const levels = [];
    const attributes = [];
    const archetypes = [];
    const ygoprodeckUrls = [];

    for (const card of cardsData) {
      ids.push(card.id);
      names.push(card.name);
      types.push(card.type);
      humanReadableCardTypes.push(card.humanReadableCardType);
      frameTypes.push(card.frameType);
      descriptions.push(card.desc);
      races.push(card.race);
      atks.push(card.atk ?? null);
      defs.push(card.def ?? null);
      levels.push(card.level ?? null);
      attributes.push(card.attribute ?? null);
      archetypes.push(card.archetype ?? null);
      ygoprodeckUrls.push(card.ygoprodeck_url);
    }

    console.log("💾 Insertando cartas principales...");
    await db.query(
      `
      INSERT INTO cards (
        id, name, type, human_readable_card_type, frame_type,
        description, race, atk, def, level, attribute, archetype, ygoprodeck_url
      )
      SELECT * FROM unnest(
        $1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::int[], $9::int[], $10::int[],
        $11::text[], $12::text[], $13::text[]
      )
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
        ids,
        names,
        types,
        humanReadableCardTypes,
        frameTypes,
        descriptions,
        races,
        atks,
        defs,
        levels,
        attributes,
        archetypes,
        ygoprodeckUrls,
      ]
    );

    // ========== 2. LIMPIAR DATOS ANTIGUOS ==========
    console.log("🗑️  Limpiando datos relacionados antiguos...");
    await db.query(`DELETE FROM card_types WHERE card_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM card_printings WHERE card_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM card_images WHERE card_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM card_prices WHERE card_id = ANY($1)`, [ids]);

    // ========== 3. PREPARAR DATOS RELACIONADOS ==========
    const cardTypesIds = [];
    const cardTypesNames = [];

    const printingsCardIds = [];
    const printingsSetNames = [];
    const printingsSetCodes = [];
    const printingsSetRarities = [];
    const printingsSetRarityCodes = [];
    const printingsSetPrices = [];

    const banlistCardIds = [];
    const banlistBanOcg = [];

    const imagesCardIds = [];
    const imagesUrls = [];
    const imagesUrlsSmall = [];
    const imagesUrlsCropped = [];

    const pricesCardIds = [];
    const pricesCardmarket = [];
    const pricesTcgplayer = [];
    const pricesEbay = [];
    const pricesAmazon = [];
    const pricesCoolstuffinc = [];

    for (const card of cardsData) {
      const {
        id,
        typeline = [],
        card_sets = [],
        banlist_info,
        card_images = [],
        card_prices = [],
      } = card;

      // card_types
      for (const t of typeline) {
        cardTypesIds.push(id);
        cardTypesNames.push(t);
      }

      // card_printings
      for (const set of card_sets) {
        printingsCardIds.push(id);
        printingsSetNames.push(set.set_name);
        printingsSetCodes.push(set.set_code);
        printingsSetRarities.push(set.set_rarity);
        printingsSetRarityCodes.push(set.set_rarity_code || null);
        printingsSetPrices.push(parseFloat(set.set_price) || 0);
      }

      // banlist_info
      if (banlist_info) {
        banlistCardIds.push(id);
        banlistBanOcg.push(banlist_info.ban_ocg || null);
      }

      // card_images
      for (const img of card_images) {
        imagesCardIds.push(id);
        imagesUrls.push(img.image_url);
        imagesUrlsSmall.push(img.image_url_small || null);
        imagesUrlsCropped.push(img.image_url_cropped || null);
      }

      // card_prices
      for (const price of card_prices) {
        pricesCardIds.push(id);
        pricesCardmarket.push(parseFloat(price.cardmarket_price) || 0);
        pricesTcgplayer.push(parseFloat(price.tcgplayer_price) || 0);
        pricesEbay.push(parseFloat(price.ebay_price) || 0);
        pricesAmazon.push(parseFloat(price.amazon_price) || 0);
        pricesCoolstuffinc.push(parseFloat(price.coolstuffinc_price) || 0);
      }
    }

    // ========== 4. INSERTAR CARD_TYPES ==========
    if (cardTypesIds.length > 0) {
      console.log(`💾 Insertando ${cardTypesIds.length} tipos de cartas...`);
      await db.query(
        `
        INSERT INTO card_types (card_id, type_name)
        SELECT * FROM unnest($1::bigint[], $2::text[])
        ON CONFLICT (card_id, type_name) DO NOTHING
        `,
        [cardTypesIds, cardTypesNames]
      );
    }

    // ========== 5. INSERTAR CARD_PRINTINGS ==========
    if (printingsCardIds.length > 0) {
      console.log(`💾 Insertando ${printingsCardIds.length} printings...`);
      await db.query(
        `
        INSERT INTO card_printings (
          card_id, set_name, set_code, set_rarity, set_rarity_code, set_price
        )
        SELECT * FROM unnest(
          $1::bigint[], $2::text[], $3::text[], 
          $4::text[], $5::text[], $6::decimal[]
        )
        `,
        [
          printingsCardIds,
          printingsSetNames,
          printingsSetCodes,
          printingsSetRarities,
          printingsSetRarityCodes,
          printingsSetPrices,
        ]
      );
    }

    // ========== 6. INSERTAR BANLIST_INFO ==========
    if (banlistCardIds.length > 0) {
      console.log(`💾 Insertando ${banlistCardIds.length} banlist info...`);
      await db.query(
        `
        INSERT INTO banlist_info (card_id, ban_ocg)
        SELECT * FROM unnest($1::bigint[], $2::text[])
        ON CONFLICT (card_id) DO UPDATE SET ban_ocg = EXCLUDED.ban_ocg
        `,
        [banlistCardIds, banlistBanOcg]
      );
    }

    // ========== 7. INSERTAR CARD_IMAGES ==========
    if (imagesCardIds.length > 0) {
      console.log(`💾 Insertando ${imagesCardIds.length} imágenes...`);
      await db.query(
        `
        INSERT INTO card_images (
          card_id, image_url, image_url_small, image_url_cropped
        )
        SELECT * FROM unnest(
          $1::bigint[], $2::text[], $3::text[], $4::text[]
        )
        `,
        [imagesCardIds, imagesUrls, imagesUrlsSmall, imagesUrlsCropped]
      );
    }

    // ========== 8. INSERTAR CARD_PRICES ==========
    if (pricesCardIds.length > 0) {
      console.log(`💾 Insertando ${pricesCardIds.length} precios...`);
      await db.query(
        `
        INSERT INTO card_prices (
          card_id, cardmarket_price, tcgplayer_price, ebay_price,
          amazon_price, coolstuffinc_price
        )
        SELECT * FROM unnest(
          $1::bigint[], $2::decimal[], $3::decimal[], 
          $4::decimal[], $5::decimal[], $6::decimal[]
        )
        `,
        [
          pricesCardIds,
          pricesCardmarket,
          pricesTcgplayer,
          pricesEbay,
          pricesAmazon,
          pricesCoolstuffinc,
        ]
      );
    }

    await db.query("COMMIT");
    console.log("✅ Proceso completado exitosamente");

    res.send({
      message: "Cartas insertadas exitosamente",
      data: {
        cards: cardsData.length,
        types: cardTypesIds.length,
        printings: printingsCardIds.length,
        banlist: banlistCardIds.length,
        images: imagesCardIds.length,
        prices: pricesCardIds.length,
      },
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("❌ Error al insertar cartas:", error);
    res.status(500).send({
      error: "Error en el servidor",
      message: error.message,
    });
  }
});

router.get("/searchCards", async (req, res) => {
  try {
    const { name } = req.query;

    // Validar que se proporcione un nombre
    if (!name || name.trim() === "") {
      return res.status(400).json({
        error: "El parámetro 'name' es requerido",
        example: "/searchCards?name=Diabellstar",
      });
    }

    console.log(`🔍 Buscando cartas con nombre: "${name}"`);

    // Query principal para obtener las cartas
    const cardsResult = await db.query(
      `
      SELECT 
        id, name, type, human_readable_card_type as "humanReadableCardType",
        frame_type as "frameType", description as desc, race, atk, def, 
        level, attribute, archetype, ygoprodeck_url
      FROM cards
      WHERE name ILIKE $1
      ORDER BY name
      `,
      [`%${name}%`]
    );

    if (cardsResult.rows.length === 0) {
      return res.json({
        message: "No se encontraron cartas",
        data: [],
      });
    }

    console.log(`✅ Se encontraron ${cardsResult.rows.length} cartas`);

    // Obtener IDs de las cartas encontradas
    const cardIds = cardsResult.rows.map((card) => card.id);

    // Consultar datos relacionados en paralelo
    const [typesResult, setsResult, banlistResult, imagesResult, pricesResult] =
      await Promise.all([
        // card_types
        db.query(
          `SELECT card_id, type_name FROM card_types WHERE card_id = ANY($1)`,
          [cardIds]
        ),
        // card_printings
        db.query(
          `SELECT card_id, set_name, set_code, set_rarity, set_rarity_code, set_price
           FROM card_printings WHERE card_id = ANY($1)
           ORDER BY card_id, set_name`,
          [cardIds]
        ),
        // banlist_info
        db.query(
          `SELECT card_id, ban_ocg FROM banlist_info WHERE card_id = ANY($1)`,
          [cardIds]
        ),
        // card_images
        db.query(
          `SELECT card_id, image_url, image_url_small, image_url_cropped
           FROM card_images WHERE card_id = ANY($1)`,
          [cardIds]
        ),
        // card_prices
        db.query(
          `SELECT card_id, cardmarket_price, tcgplayer_price, ebay_price, 
                  amazon_price, coolstuffinc_price
           FROM card_prices WHERE card_id = ANY($1)`,
          [cardIds]
        ),
      ]);

    // Organizar datos relacionados por card_id
    const typesByCard = {};
    const setsByCard = {};
    const banlistByCard = {};
    const imagesByCard = {};
    const pricesByCard = {};

    typesResult.rows.forEach((row) => {
      if (!typesByCard[row.card_id]) typesByCard[row.card_id] = [];
      typesByCard[row.card_id].push(row.type_name);
    });

    setsResult.rows.forEach((row) => {
      if (!setsByCard[row.card_id]) setsByCard[row.card_id] = [];
      setsByCard[row.card_id].push({
        set_name: row.set_name,
        set_code: row.set_code,
        set_rarity: row.set_rarity,
        set_rarity_code: row.set_rarity_code,
        set_price: row.set_price.toString(),
      });
    });

    banlistResult.rows.forEach((row) => {
      banlistByCard[row.card_id] = {
        ban_ocg: row.ban_ocg,
      };
    });

    imagesResult.rows.forEach((row) => {
      if (!imagesByCard[row.card_id]) imagesByCard[row.card_id] = [];
      imagesByCard[row.card_id].push({
        id: row.card_id,
        image_url: row.image_url,
        image_url_small: row.image_url_small,
        image_url_cropped: row.image_url_cropped,
      });
    });

    pricesResult.rows.forEach((row) => {
      if (!pricesByCard[row.card_id]) pricesByCard[row.card_id] = [];
      pricesByCard[row.card_id].push({
        cardmarket_price: row.cardmarket_price.toString(),
        tcgplayer_price: row.tcgplayer_price.toString(),
        ebay_price: row.ebay_price.toString(),
        amazon_price: row.amazon_price.toString(),
        coolstuffinc_price: row.coolstuffinc_price.toString(),
      });
    });

    // Construir respuesta final
    const data = cardsResult.rows.map((card) => ({
      id: card.id,
      name: card.name,
      typeline: typesByCard[card.id] || [],
      type: card.type,
      humanReadableCardType: card.humanReadableCardType,
      frameType: card.frameType,
      desc: card.desc,
      race: card.race,
      atk: card.atk,
      def: card.def,
      level: card.level,
      attribute: card.attribute,
      archetype: card.archetype,
      ygoprodeck_url: card.ygoprodeck_url,
      card_sets: setsByCard[card.id] || [],
      banlist_info: banlistByCard[card.id] || undefined,
      card_images: imagesByCard[card.id] || [],
      card_prices: pricesByCard[card.id] || [],
    }));

    res.json({
      data,
    });
  } catch (error) {
    console.error("❌ Error al buscar cartas:", error);
    res.status(500).json({
      error: "Error en el servidor",
      message: error.message,
    });
  }
});

export default router;
