import fs from "node:fs";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const localEnvUrl = new URL("../supabase/.env.database.local", import.meta.url);
let connectionString = process.env.SUPABASE_DB_URL;
let databasePassword = process.env.AVENA_DB_PASSWORD;

if (fs.existsSync(localEnvUrl)) {
  const lines = fs.readFileSync(localEnvUrl, "utf8").split(/\r?\n/);
  const readValue = (key) => lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1).trim();
  connectionString ||= readValue("SUPABASE_DB_URL");
  databasePassword ||= readValue("AVENA_DB_PASSWORD");
}

if (!connectionString && databasePassword && databasePassword !== "PON_AQUI_LA_CONTRASENA") {
  const url = new URL("postgresql://postgres.vnvnsxkhqanwfbxcsvqz@aws-1-us-east-1.pooler.supabase.com:5432/postgres");
  url.password = databasePassword;
  connectionString = url.toString();
}
if (!connectionString || connectionString.includes("[YOUR-DATABASE-PASSWORD]") || connectionString.includes("[YOUR-PASSWORD]")) {
  console.error("Configura AVENA_DB_PASSWORD en supabase/.env.database.local o define SUPABASE_DB_URL.");
  process.exit(1);
}

const sql = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const existing = await client.query("select to_regclass('public.inventory_items') as inventory, to_regclass('public.catalog_items') as catalog");
  if (existing.rows[0].inventory || existing.rows[0].catalog) {
    throw new Error("Esta base ya tiene tablas de la aplicacion. Usa una migracion para actualizarla; no repitas la instalacion inicial.");
  }
  await client.query("begin");
  await client.query(sql);
  await client.query(fs.readFileSync(new URL('../supabase/operations.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261111_pay_later.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261111_order_total_guard.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261114_catalog_images.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261114_admin_statistics.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261114_realtime_notifications.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/seed_avena_inventario.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261121_unificar_productos.sql', import.meta.url), 'utf8').replace(/^begin;|commit;$/gim, ''));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261121_crear_producto.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261121_cinco_mesas.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261121_buscar_contactos.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261122_personal_historial.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261122_crear_acceso.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261122_turnos_mesas.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261122_gestion_usuarios.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261122_saludo_personal.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261122_agregar_cuenta_mesa.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL('../supabase/migrations/20261122_barrios_domicilio.sql', import.meta.url), 'utf8'));
  await client.query(fs.readFileSync(new URL("../supabase/migrations/20261123_breb.sql", import.meta.url), "utf8"));
  await client.query("commit");
  const result = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('app_settings', 'catalog_items', 'daily_menus', 'contacts', 'orders')
    order by table_name
  `);
  console.log(`Esquema aplicado. Tablas verificadas: ${result.rows.map((row) => row.table_name).join(", ")}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`No se pudo aplicar el esquema: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
