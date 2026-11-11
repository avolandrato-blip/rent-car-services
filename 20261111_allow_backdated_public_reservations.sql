-- Autorise les dates de début passées pour la saisie de régularisations.
-- Conserve la validation des champs manquants et l’obligation end_at > start_at.
-- Modifie uniquement la définition de la fonction déjà déployée, en vérifiant
-- que la clause attendue existe exactement une fois avant de la remplacer.
do $migration$
declare
  v_definition text;
  v_old_clause text := ' or v_start < now()';
begin
  select pg_get_functiondef('public.create_public_distance_reservation(jsonb)'::regprocedure)
    into v_definition;

  if length(v_definition) - length(replace(v_definition, v_old_clause, '')) <> length(v_old_clause) then
    raise exception 'Expected exactly one past-start-date guard in create_public_distance_reservation';
  end if;

  v_definition := replace(v_definition, v_old_clause, '');
  execute v_definition;
end;
$migration$;
