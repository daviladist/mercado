-- Dados de exemplo no formato da versão que está no ar (antes de separar por empresa). Fictícios.
insert into users(role,login,ref_id,name,pass_hash,must_reset) values
 ('admin','eduardo','adm_x','Dono','scrypt$17$8$1$AAAA$BBBB',false),
 ('cliente','kesfi','c1','KESFI','scrypt$17$8$1$AAAA$BBBB',true),
 ('vendedor','kesfi','s1','Vendedor Kesfi','scrypt$17$8$1$AAAA$BBBB',true);
insert into docs(coll,id,data,ord) values
 ('meta','store','{"name":"ATACADO DAVILA"}',null),
 ('products','p1','{"id":"p1","name":"Arroz","price":25,"cost":20,"stock":10,"photo":"/api/photo/p%3Ap1%3Aabc"}',0),
 ('customers','c1','{"id":"c1","name":"KESFI","login":"kesfi"}',0),
 ('orders','o1','{"id":"o1","no":1001,"status":"concluido","customerId":"c1","items":[]}',null),
 ('orders','o2','{"id":"o2","no":"A-7","status":"novo","customerId":"c1","items":[]}',null),
 ('orders','o3','{"id":"o3","no":1002,"status":"novo","customerId":"c1","items":[]}',null),
 ('receivables','r1','{"id":"r1","customerId":"c1","amount":50}',null);
insert into photos(id,data) values ('p:p1:abc','data:image/png;base64,iVBORw0KGgo=');
select setval('order_no', 1002);
