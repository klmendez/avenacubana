-- Carga inicial: IDs UUID nuevos; no modifica existencias ya existentes.
-- Las cantidades son una instantánea proporcionada por el negocio.
insert into public.admin_emails(email) values ('avenacubanapop@gmail.com') on conflict do nothing;
with source(name,quantity,minimum_quantity,unit) as (values
  ('Sevillana vaso 9 oz',179,14,'VASO'),
  ('Sevillana 1Lt',7,10,'LITRO'),
  ('Sevillana 2 Lt',10,5,'2 LITROS'),
  ('Avena Cubana 1 Lt',19,10,'LITRO'),
  ('Avena Cubana 2 Lt',0,5,'2 LITROS'),
  ('Yogurt Fresa vaso 9oz',0,15,'VASO'),
  ('Yogurt Fresa 1 Lt',0,10,'LITRO'),
  ('Yogurt Fresa 2 Lt',0,5,'2 LITROS'),
  ('Kumis vaso 9oz',26,15,'VASO'),
  ('Kumis 1 Lt',20,10,'LITRO'),
  ('Kumis 2 Lt',0,5,'2 LITROS'),
  ('Cucas 1 unidad',241,30,'UNIDAD'),
  ('Cucas paquete x 10',0,3,'PAQUETE'),
  ('Mantecadas por unidad',0,30,'UNIDAD'),
  ('Almojábanas por unidad',20,30,'UNIDAD'),
  ('Kumis vaso 12oz',0,15,'VASO'),
  ('Sevillana Galón',0,5,'GALÓN'),
  ('Avena Galón',0,5,'GALÓN'),
  ('Kumis Galón',0,5,'GALÓN'),
  ('Yogurt Fresa vaso 12oz',0,15,'VASO'),
  ('Yogurt Melocotón vaso 9oz',0,15,'VASO'),
  ('Yogurt Melocotón vaso 12oz',0,15,'VASO'),
  ('Yogurt Maracumango 9oz',42,15,'VASO'),
  ('Yogurt Maracumango 12oz',0,15,'VASO'),
  ('Yogurt Melocotón 1lt',0,10,'LITRO'),
  ('Yogurt Melocotón 2lt',0,5,'2 LITROS'),
  ('Yogurt Maracumango 2lt',0,5,'2 LITROS'),
  ('Avena Cubana Vaso 10oz',136,15,'VASO'),
  ('Sevillana Vaso 10oz',0,15,'VASO'),
  ('Kumis Vaso 10 oz',0,15,'VASO'),
  ('Yogurt Maracumango 10 oz',0,15,'VASO'),
  ('Yogurt Fresa Vaso 10 oz',0,15,'VASO'),
  ('Yogurt Frutos Rojos 10 oz',0,15,'LITRO'),
  ('Yogurt Mora',0,15,'LITRO'),
  ('Pastel de Pollo Und',20,15,'UNIDAD'),
  ('Yogurt de Maracumango',0,5,'LITRO'),
  ('YOGURT DE MARACUMANGO',5,5,'GALÓN')
), inserted as (
  insert into public.inventory_items(name, quantity, minimum_quantity, unit)
  select s.name,s.quantity,s.minimum_quantity,s.unit from source s
  where not exists (select 1 from public.inventory_items i where lower(i.name)=lower(s.name) and lower(i.unit)=lower(s.unit))
  returning id, quantity
)
insert into public.inventory_movements(inventory_item_id,quantity_change,reason)
select id,quantity,'Carga inicial de Avena Cubana Pop' from inserted where quantity > 0;
