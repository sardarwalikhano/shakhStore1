-- M04: Sorani-first platform category taxonomy.
insert into public.catalog_categories(slug,name_ckb,name_ar,name_en,sort_order,is_active)
values
('restaurant','چێشتخانە و خواردن','مطاعم وأطعمة','Restaurants & Food',10,true),
('supermarket','سوپەرمارکێت','سوبرماركت','Supermarkets',20,true),
('fruits_vegetables','سەوزە و میوە','خضروات وفواكه','Fruit & Vegetables',30,true),
('meat_seafood','گۆشت و سپیاتی','لحوم ومأكولات بحرية','Meat & Seafood',40,true)
on conflict(slug) do update set
 name_ckb=excluded.name_ckb,name_ar=excluded.name_ar,name_en=excluded.name_en,
 sort_order=excluded.sort_order,is_active=true;
