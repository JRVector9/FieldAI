create unique index ap_field_action_one_unknown_work_idx
  on ap.field_action_requests(inquiry_id, connection_id, service_id, kind)
  where state in ('sending', 'delivery_unknown');
