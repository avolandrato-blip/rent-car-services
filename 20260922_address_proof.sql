alter table public.contract_documents drop constraint if exists contract_documents_document_kind_check;
alter table public.contract_documents add constraint contract_documents_document_kind_check check (document_kind in ('cin_recto','cin_verso','permis_recto','proof_of_address'));
