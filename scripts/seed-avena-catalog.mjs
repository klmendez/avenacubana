import fs from 'node:fs';
import pg from 'pg';
const settings = fs.readFileSync('supabase/.env.database.local','utf8').split(/\r?\n/);
const password = settings.find(line => line.startsWith('AVENA_DB_PASSWORD='))?.slice('AVENA_DB_PASSWORD='.length).trim();
if (!password || password === 'PON_AQUI_LA_CONTRASENA') throw new Error('Falta la contrasena de la base de datos.');
const url = new URL('postgresql://postgres.vnvnsxkhqanwfbxcsvqz@aws-1-us-east-1.pooler.supabase.com:5432/postgres'); url.password = password;
const images = JSON.parse(fs.readFileSync('supabase/imagenes_avena.json','utf8'));
const client = new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false}});
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function priceFor(row) {
  const name=normalize(row.name), unit=normalize(row.unit);
  if (name.includes('vaso') || /\b(?:9|10|12)\s*oz\b/.test(name)) return null;
  if (name.includes('cucas paquete')) return 10000;
  if (name.includes('cucas')) return 1000;
  if (name.includes('almojaban')) return 2000;
  if (name.includes('mantecada')) return 3000;
  if (name.includes('pastel')) return 3500;
  if (unit === 'galon') return 48000;
  if (unit === '2 litros') return 24000;
  if (unit === 'litro') return 13000;
  return null;
}
function categoryFor(name) {
 const n=normalize(name);
 if (/cucas|mantecada|almojaban|pastel/.test(n)) return 'Acompanantes';
 if(n.includes('avena')) return 'Avena cubana';
 if(n.includes('sevillana')) return 'Sevillana';
 if(n.includes('kumis')) return 'Kumis';
 return 'Yogurt frutal';
}
try {
 await client.connect(); await client.query('begin');
 const inventory=await client.query('select id,name,unit from public.inventory_items order by name');
 let created=0, existing=0, pending=0;
 for(const item of inventory.rows) {
  const price=priceFor(item); if(price===null){pending++;continue;}
  const category=categoryFor(item.name); const type=category==='Acompanantes'?'otro':'bebida';
  const catalogName = normalize(item.name) === 'yogurt de maracumango' ? `Yogurt de Maracumango ${normalize(item.unit) === 'galon' ? 'galon' : '1 Lt'}` : item.name;
  const prior=await client.query('select id from public.catalog_items where business=$1 and lower(name)=lower($2)', ['la_tuba',catalogName]);
  let id;
  if(prior.rowCount) { id=prior.rows[0].id; existing++; }
  else { const r=await client.query('insert into public.catalog_items(name,category,item_type,price,image_url) values ($1,$2,$3,$4,$5) returning id',[catalogName,category,type,price,images[item.name]??null]);id=r.rows[0].id;created++; }
  await client.query('insert into public.catalog_inventory_requirements(catalog_item_id,inventory_item_id,quantity_required) values ($1,$2,1) on conflict do nothing',[id,item.id]);
 }
 await client.query(`create or replace function public.public_catalog_items() returns setof public.catalog_items language sql stable security definer set search_path=public as $$
 select c.id,c.name,c.description,c.category,c.item_type,c.price,c.image_url,
 (c.available and exists(select 1 from public.catalog_inventory_requirements r where r.catalog_item_id=c.id) and not exists(select 1 from public.catalog_inventory_requirements r join public.inventory_items i on i.id=r.inventory_item_id where r.catalog_item_id=c.id and i.quantity<r.quantity_required)) as available,
 c.business,c.created_at,c.updated_at from public.catalog_items c where c.available and c.business='la_tuba' $$`);
 await client.query('commit'); console.log(`Catalogo: ${created} productos nuevos, ${existing} existentes; ${pending} pendientes de precio.`);
} catch(error) { try{await client.query('rollback')}catch{} console.error('No se aplico el catalogo:',error.message); process.exitCode=1; }
finally {await client.end()}
