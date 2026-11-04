-- Tag existing Accounts Payable / Logistics contacts with the Non-buying category
UPDATE "crm_contacts" SET "categories" = array_append("categories", 'Non-buying')
WHERE "role" IN ('Accounts Payable', 'Logistics') AND NOT ('Non-buying' = ANY("categories"));
