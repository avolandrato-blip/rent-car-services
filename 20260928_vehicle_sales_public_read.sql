drop policy if exists vehicle_sales_public_read_accepted on public.vehicle_sales;
create policy vehicle_sales_public_read_accepted on public.vehicle_sales for select to anon using (status = 'accepted');
