import fs from 'node:fs';
import pg from 'pg';

// Configura solo clasificaciones identificables; nunca modifica precio, existencia ni visibilidad.
const lines = fs.readFileSync(new URL('../supabase/.env.database.local', import.meta.url), 'utf8').split(/\r?\n/);
const envValue = key => lines.find(line => line.startsWith(`${key}=`))?.slice(key.length + 1).trim();
let connectionString = process.env.SUPABASE_DB_URL || envValue('SUPABASE_DB_URL');
if (!connectionString) {
  const url = new URL('postgresql://postgres.vnvnsxkhqanwfbxcsvqz@aws-1-us-east-1.pooler.supabase.com:5432/postgres');
  url.password = process.env.AVENA_DB_PASSWORD || envValue('AVENA_DB_PASSWORD') || '';
  connectionString = url.toString();
}
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const flavors = ['Arequipe con pasas','Maracumango','Frutos rojos','Ron con pasas','Melocotón','Fresa','Mora','Piña'];
function classify(row) {
  const name = row.name, key = fold(name);
  // Dos registros activos representan la misma presentación; se dejan separados hasta aclarar su manejo.
  if (name === 'Yogurt Fresa vaso 9oz') return null;
  const match = key.match(/\s+((?:vaso\s*)?(\d+)\s*(oz|lt|litros?)|vaso|galon|por unidad|1 unidad|und|paquete\s+x\s*\d+)$/);
  let size = null;
  if (match) {
    if (match[2]) size = match[3] === 'oz' ? `Vaso ${Number(match[2])} oz` : `${Number(match[2])} ${Number(match[2]) === 1 ? 'litro' : 'litros'}`;
    else if (match[1] === 'galon') size = 'Galón';
    else if (match[1] === 'vaso') size = 'Vaso';
    else if (['por unidad','1 unidad','und'].includes(match[1])) size = 'Unidad';
    else size = match[1].replace(' x', ' x ');
  }
  let family, flavor = null, category = row.category, type = row.item_type;
  if (key.startsWith('yogurt cuchareable ')) {
    family = 'Yogurt cuchareable'; category = 'Yogurt cuchareable'; type = 'carta';
    flavor = flavors.find(value => key.includes(fold(value))) || null;
    // El recipiente es un vaso; su capacidad no está registrada.
    size ||= 'Vaso';
  } else if (key.startsWith('yogurt griego')) {
    family = 'Yogurt griego'; category = 'Yogurt griego'; type = 'carta';
    if (size?.startsWith('Vaso ')) size = size.slice(5);
    flavor = flavors.find(value => key.includes(fold(value))) || (size ? 'Natural' : null);
  } else if (fold(category) === 'yogurt frutal') {
    family = 'Yogurt frutal'; type = 'bebida';
    flavor = flavors.find(value => key.includes(fold(value))) || null;
    if (!flavor) return null;
  } else if (key.startsWith('kumis patiano')) {
    family = 'Kumis Patiano'; category = 'Kumis'; type = 'bebida';
  } else if (key.startsWith('kumis sin azucar')) {
    family = 'Kumis sin azúcar'; category = 'Kumis'; type = 'bebida';
  } else if (key.startsWith('kumis ')) {
    family = 'Kumis tradicional'; type = 'bebida';
  } else if (key.startsWith('avena ')) {
    family = 'Avena Cubana'; type = 'bebida';
  } else if (key.startsWith('sevillana ')) {
    family = 'Súper Sevillana'; type = 'bebida';
  } else return null;
  return { family, flavor, size, category, type };
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query('begin');
  await client.query("set local lock_timeout='5s'");
  const result = await client.query('select id,name,category,item_type,family_name,presentation_name,flavor_name from public.catalog_items where deleted_at is null for update');
  const changes = [];
  for (const row of result.rows) {
    const next = classify(row);
    if (!next || row.family_name) continue;
    changes.push({ name: row.name, ...next });
    if (process.argv.includes('--apply')) await client.query(`update public.catalog_items set
      family_name=$2, presentation_name=coalesce(presentation_name,$3), flavor_name=coalesce(flavor_name,$4),
      category=$5, item_type=$6, updated_at=now() where id=$1`, [row.id,next.family,next.size,next.flavor,next.category,next.type]);
  }
  await client.query(process.argv.includes('--apply') ? 'commit' : 'rollback');
  console.log(JSON.stringify({ applied: process.argv.includes('--apply'), count: changes.length, changes }, null, 2));
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error.message); process.exitCode = 1;
} finally { await client.end(); }
