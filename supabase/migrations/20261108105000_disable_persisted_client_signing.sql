revoke all on function public.create_contract_signing_link(uuid) from public, anon, authenticated;
revoke all on function public.get_contract_for_signing(text) from public, anon, authenticated;
revoke all on function public.sign_contract(text, text, text, text, text, text, text) from public, anon, authenticated;
