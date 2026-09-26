alter table field.external_reservation_manual_contacts
  drop constraint external_reservation_manual_contacts_actor_user_id_fkey;
alter table field.external_reservation_manual_contacts
  alter column actor_user_id drop not null;
alter table field.external_reservation_manual_contacts
  add constraint external_reservation_manual_contacts_actor_user_id_fkey
  foreign key (actor_user_id) references "user"(id) on delete set null;
